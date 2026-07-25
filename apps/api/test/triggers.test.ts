import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { Metrics } from "../src/metrics.js";
import type {
  Trigger,
  TriggerRepository,
} from "../src/modules/triggers/service.js";
import { TriggerService } from "../src/modules/triggers/service.js";

class Memory implements TriggerRepository {
  trigger: Trigger = {
    id: "hook",
    tenantId: "tenant",
    workflowId: "workflow",
    kind: "WEBHOOK",
    secret: "secret",
  };
  deliveries = new Set<string>();
  dead: string[] = [];
  advanced?: Date;
  async create(input: Trigger) {
    this.trigger = input;
    return input;
  }
  async find(id: string) {
    return id === this.trigger.id ? this.trigger : null;
  }
  async enqueue(input: Parameters<TriggerRepository["enqueue"]>[0]) {
    if (this.deliveries.has(input.deliveryId)) return "DUPLICATE" as const;
    this.deliveries.add(input.deliveryId);
    return { executionId: `execution-${input.deliveryId}` };
  }
  async deadLetter(input: Parameters<TriggerRepository["deadLetter"]>[0]) {
    this.dead.push(input.reason);
  }
  async due() {
    return [this.trigger];
  }
  async advance(_id: string, at: Date) {
    this.advanced = at;
  }
}

const signed = (payload: Uint8Array, timestamp: string) => ({
  "x-relay-delivery": "delivery-1",
  "x-relay-timestamp": timestamp,
  "x-relay-signature": `sha256=${createHmac("sha256", "secret").update(`${timestamp}.`).update(payload).digest("hex")}`,
});

describe("triggers", () => {
  it("authenticates raw payloads and deduplicates delivery IDs", async () => {
    const repo = new Memory();
    const service = new TriggerService(repo, new Metrics());
    const now = new Date("2026-01-01T00:00:00Z");
    const payload = new TextEncoder().encode('{ "amount": 5 }');
    const headers = signed(payload, String(now.getTime() / 1000));
    await expect(
      service.ingest("hook", headers, payload, now),
    ).resolves.toMatchObject({ duplicate: false });
    await expect(
      service.ingest("hook", headers, payload, now),
    ).resolves.toEqual({ duplicate: true });
  });
  it("rejects tampering before enqueue", async () => {
    const repo = new Memory();
    const service = new TriggerService(repo, new Metrics());
    const now = new Date();
    const payload = new TextEncoder().encode("safe");
    await expect(
      service.ingest(
        "hook",
        signed(payload, String(Math.floor(now.getTime() / 1000))),
        new TextEncoder().encode("changed"),
        now,
      ),
    ).rejects.toMatchObject({ code: "INVALID_SIGNATURE" });
    expect(repo.deliveries.size).toBe(0);
  });
  it("dead-letters over-limit deliveries", async () => {
    const repo = new Memory();
    const service = new TriggerService(repo, new Metrics(), 1);
    const now = new Date();
    const payload = new TextEncoder().encode("x");
    const timestamp = String(Math.floor(now.getTime() / 1000));
    await service.ingest("hook", signed(payload, timestamp), payload, now);
    await expect(
      service.ingest(
        "hook",
        { ...signed(payload, timestamp), "x-relay-delivery": "delivery-2" },
        payload,
        now,
      ),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(repo.dead).toEqual(["RATE_LIMITED"]);
  });
  it("advances cron schedules after dispatch", async () => {
    const repo = new Memory();
    repo.trigger = {
      ...repo.trigger,
      kind: "CRON",
      schedule: "EVERY_5_MINUTES",
    };
    const now = new Date("2026-01-01T00:00:00Z");
    await expect(
      new TriggerService(repo, new Metrics()).dispatchDue(now),
    ).resolves.toEqual({ dispatched: 1 });
    expect(repo.advanced?.toISOString()).toBe("2026-01-01T00:05:00.000Z");
  });
});
