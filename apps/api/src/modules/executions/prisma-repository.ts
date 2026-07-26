import { prisma } from "../../db.js";
import type { ExecutionRepository } from "./service.js";

export class PrismaExecutionRepository implements ExecutionRepository {
  async trace(tenantId: string, executionId: string) {
    return prisma.execution.findFirst({
      where: { id: executionId, tenantId },
      include: {
        steps: { orderBy: { createdAt: "asc" } },
        events: { orderBy: { sequence: "asc" } },
      },
    });
  }

  async replay(input: Parameters<ExecutionRepository["replay"]>[0]) {
    return prisma.$transaction(async (transaction) => {
      const original = await transaction.execution.findFirst({
        where: { id: input.executionId, tenantId: input.tenantId },
      });
      if (!original) return "NOT_FOUND" as const;
      const quota = await transaction.tenantQuota.findUnique({
        where: { tenantId: input.tenantId },
      });
      if (quota) {
        const count = await transaction.execution.count({
          where: {
            tenantId: input.tenantId,
            createdAt: { gte: new Date(Date.now() - 86_400_000) },
          },
        });
        if (count >= quota.maxExecutionsPerDay)
          return "QUOTA_EXCEEDED" as const;
      }
      const replay = await transaction.execution.create({
        data: {
          tenantId: original.tenantId,
          workflowId: original.workflowId,
          workflowVersionId: original.workflowVersionId,
          idempotencyKey: input.idempotencyKey,
          payloadDocumentId: original.payloadDocumentId,
          replayOfId: original.id,
        },
      });
      await transaction.executionEvent.create({
        data: {
          executionId: replay.id,
          sequence: 1,
          type: "execution.replayed",
          severity: "INFO",
          fields: { replayOfId: original.id },
        },
      });
      await transaction.auditEvent.create({
        data: {
          tenantId: input.tenantId,
          actorId: input.actorId,
          action: "execution.replayed",
          target: "Execution",
          targetId: replay.id,
          metadata: { replayOfId: original.id },
        },
      });
      return { id: replay.id, replayOfId: original.id };
    });
  }
}
