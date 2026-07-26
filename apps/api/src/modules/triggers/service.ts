import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { triggerCreateInput } from "@relay/contracts";
import type { Metrics } from "../../metrics.js";
import type { Principal } from "../access/service.js";
import { DomainError } from "../access/service.js";

export type Trigger = {
  id: string;
  tenantId: string;
  workflowId: string;
  kind: "WEBHOOK" | "CRON";
  schedule?: TriggerSchedule;
  secret: string;
};
export type TriggerSchedule = "EVERY_5_MINUTES" | "HOURLY" | "DAILY";

export interface TriggerRepository {
  create(
    input: Trigger & { workspaceId: string; actorId: string },
  ): Promise<Trigger | "WORKFLOW_NOT_FOUND">;
  find(id: string): Promise<Trigger | null>;
  enqueue(input: {
    trigger: Trigger;
    deliveryId: string;
    payloadHash: string;
    payload: Uint8Array;
    occurredAt: Date;
  }): Promise<
    { executionId: string } | "DUPLICATE" | "UNPUBLISHED" | "QUOTA_EXCEEDED"
  >;
  deadLetter(input: {
    triggerId: string;
    deliveryId: string;
    payloadHash: string;
    reason: string;
  }): Promise<void>;
  due(now: Date): Promise<Trigger[]>;
  advance(triggerId: string, nextAt: Date): Promise<void>;
}

type Bucket = { minute: number; count: number };

export class TriggerService {
  private readonly buckets = new Map<string, Bucket>();
  constructor(
    private readonly repository: TriggerRepository,
    private readonly metrics: Metrics,
    private readonly limit = 60,
  ) {}

  async create(principal: Principal, untrusted: unknown) {
    if (!["OWNER", "ADMIN", "EDITOR"].includes(principal.role))
      throw new DomainError(
        "FORBIDDEN",
        403,
        "Trigger editing requires editor.",
      );
    const input = triggerCreateInput.parse(untrusted);
    const secret = randomBytes(32).toString("base64url");
    const trigger: Trigger = {
      id: crypto.randomUUID(),
      tenantId: principal.tenantId,
      workflowId: input.workflowId,
      kind: input.kind,
      secret,
      ...(input.schedule ? { schedule: input.schedule } : {}),
    };
    const result = await this.repository.create({
      ...trigger,
      workspaceId: input.workspaceId,
      actorId: principal.userId,
    });
    if (result === "WORKFLOW_NOT_FOUND")
      throw new DomainError(
        "WORKFLOW_NOT_FOUND",
        404,
        "Published workflow not found.",
      );
    this.metrics.increment("triggers_created_total", {
      kind: input.kind.toLowerCase(),
    });
    return {
      id: result.id,
      kind: result.kind,
      ...(result.schedule ? { schedule: result.schedule } : {}),
      ...(result.kind === "WEBHOOK" ? { webhookSecret: secret } : {}),
    };
  }

  async ingest(
    triggerId: string,
    headers: Record<string, string | undefined>,
    payload: Uint8Array,
    now = new Date(),
  ) {
    const trigger = await this.repository.find(triggerId);
    if (trigger?.kind !== "WEBHOOK")
      throw new DomainError(
        "TRIGGER_NOT_FOUND",
        404,
        "Webhook trigger not found.",
      );
    const deliveryId = headers["x-relay-delivery"];
    const timestamp = headers["x-relay-timestamp"];
    const signature = headers["x-relay-signature"];
    if (
      !deliveryId ||
      !timestamp ||
      !signature ||
      Math.abs(now.getTime() - Number(timestamp) * 1000) > 300_000
    )
      throw new DomainError(
        "INVALID_SIGNATURE",
        401,
        "Missing or expired webhook signature.",
      );
    const expected = createHmac("sha256", trigger.secret)
      .update(`${timestamp}.`)
      .update(payload)
      .digest("hex");
    const supplied = signature.replace(/^sha256=/, "");
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
    )
      throw new DomainError(
        "INVALID_SIGNATURE",
        401,
        "Invalid webhook signature.",
      );
    const minute = Math.floor(now.getTime() / 60_000);
    const bucket = this.buckets.get(triggerId);
    const next =
      !bucket || bucket.minute !== minute
        ? { minute, count: 1 }
        : { minute, count: bucket.count + 1 };
    this.buckets.set(triggerId, next);
    if (next.count > this.limit) {
      await this.repository.deadLetter({
        triggerId,
        deliveryId,
        payloadHash: hash(payload),
        reason: "RATE_LIMITED",
      });
      throw new DomainError(
        "RATE_LIMITED",
        422,
        "Webhook rate limit exceeded.",
      );
    }
    const result = await this.repository.enqueue({
      trigger,
      deliveryId,
      payloadHash: hash(payload),
      payload,
      occurredAt: now,
    });
    if (result === "UNPUBLISHED" || result === "QUOTA_EXCEEDED") {
      await this.repository.deadLetter({
        triggerId,
        deliveryId,
        payloadHash: hash(payload),
        reason: result,
      });
      throw new DomainError(
        result,
        result === "UNPUBLISHED" ? 409 : 422,
        result === "UNPUBLISHED"
          ? "Trigger has no published workflow version."
          : "Daily execution quota exceeded.",
      );
    }
    this.metrics.increment("trigger_deliveries_total", {
      outcome: result === "DUPLICATE" ? "duplicate" : "accepted",
    });
    return result === "DUPLICATE"
      ? { duplicate: true }
      : { duplicate: false, executionId: result.executionId };
  }

  async dispatchDue(now = new Date()) {
    const due = await this.repository.due(now);
    for (const trigger of due) {
      const deliveryId = `cron:${trigger.id}:${now.toISOString()}`;
      await this.repository.enqueue({
        trigger,
        deliveryId,
        payloadHash: hash(new Uint8Array()),
        payload: new Uint8Array(),
        occurredAt: now,
      });
      await this.repository.advance(
        trigger.id,
        nextRun(trigger.schedule ?? "HOURLY", now),
      );
    }
    return { dispatched: due.length };
  }
}

const hash = (payload: Uint8Array) =>
  createHash("sha256").update(payload).digest("hex");
const nextRun = (schedule: TriggerSchedule, now: Date) =>
  new Date(
    now.getTime() +
      { EVERY_5_MINUTES: 300_000, HOURLY: 3_600_000, DAILY: 86_400_000 }[
        schedule
      ],
  );
