import { Prisma } from "@prisma/client";
import { prisma } from "../../db.js";
import type { AesCredentialCipher } from "../access/cipher.js";
import type { Trigger, TriggerRepository, TriggerSchedule } from "./service.js";

const interval: Record<TriggerSchedule, number> = {
  EVERY_5_MINUTES: 300_000,
  HOURLY: 3_600_000,
  DAILY: 86_400_000,
};

export class PrismaTriggerRepository implements TriggerRepository {
  constructor(private readonly cipher: AesCredentialCipher) {}
  async create(input: Trigger & { workspaceId: string; actorId: string }) {
    const workflow = await prisma.workflow.findFirst({
      where: {
        id: input.workflowId,
        workspaceId: input.workspaceId,
        workspace: { tenantId: input.tenantId },
        publishedVersionId: { not: null },
      },
      select: { id: true },
    });
    if (!workflow) return "WORKFLOW_NOT_FOUND" as const;
    const encrypted = this.cipher.encrypt(input.secret);
    await prisma.$transaction([
      prisma.trigger.create({
        data: {
          id: input.id,
          tenantId: input.tenantId,
          workspaceId: input.workspaceId,
          workflowId: input.workflowId,
          kind: input.kind,
          schedule: input.schedule ?? null,
          secretCiphertext: encrypted.ciphertext,
          secretIv: encrypted.iv,
          secretTag: encrypted.tag,
          nextFireAt: input.schedule
            ? new Date(Date.now() + interval[input.schedule])
            : null,
        },
      }),
      prisma.auditEvent.create({
        data: {
          tenantId: input.tenantId,
          actorId: input.actorId,
          action: "trigger.created",
          target: "Trigger",
          targetId: input.id,
          metadata: { kind: input.kind },
        },
      }),
    ]);
    return input;
  }
  async find(id: string) {
    const row = await prisma.trigger.findUnique({ where: { id } });
    if (!row) return null;
    return {
      id: row.id,
      tenantId: row.tenantId,
      workflowId: row.workflowId,
      kind: row.kind,
      secret: this.cipher.decrypt({
        ciphertext: row.secretCiphertext,
        iv: row.secretIv,
        tag: row.secretTag,
      }),
      ...(row.schedule ? { schedule: row.schedule as TriggerSchedule } : {}),
    };
  }
  async enqueue(input: Parameters<TriggerRepository["enqueue"]>[0]) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const workflow = await tx.workflow.findUnique({
            where: { id: input.trigger.workflowId },
            select: { publishedVersionId: true },
          });
          if (!workflow?.publishedVersionId) return "UNPUBLISHED" as const;
          const delivery = await tx.triggerDelivery.create({
            data: {
              triggerId: input.trigger.id,
              deliveryId: input.deliveryId,
              payloadHash: input.payloadHash,
            },
          });
          const execution = await tx.execution.create({
            data: {
              tenantId: input.trigger.tenantId,
              workflowId: input.trigger.workflowId,
              workflowVersionId: workflow.publishedVersionId,
              idempotencyKey: `trigger:${input.trigger.id}:${input.deliveryId}`,
              payloadDocumentId: `sha256:${input.payloadHash}`,
            },
          });
          await tx.triggerDelivery.update({
            where: { id: delivery.id },
            data: { executionId: execution.id },
          });
          return { executionId: execution.id };
        },
        { isolationLevel: "Serializable" },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        return "DUPLICATE" as const;
      throw error;
    }
  }
  async deadLetter(input: Parameters<TriggerRepository["deadLetter"]>[0]) {
    await prisma.deadLetter.create({ data: input });
  }
  async due(now: Date) {
    const rows = await prisma.trigger.findMany({
      where: { kind: "CRON", nextFireAt: { lte: now } },
      take: 100,
    });
    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      workflowId: row.workflowId,
      kind: row.kind,
      secret: "",
      ...(row.schedule ? { schedule: row.schedule as TriggerSchedule } : {}),
    }));
  }
  async advance(triggerId: string, nextAt: Date) {
    await prisma.trigger.update({
      where: { id: triggerId },
      data: { nextFireAt: nextAt },
    });
  }
}
