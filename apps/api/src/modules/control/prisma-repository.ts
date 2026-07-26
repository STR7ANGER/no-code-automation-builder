import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db.js";
import type { ControlRepository } from "./service.js";

const nextSequence = async (
  transaction: Prisma.TransactionClient,
  executionId: string,
) => {
  const latest = await transaction.executionEvent.aggregate({
    where: { executionId },
    _max: { sequence: true },
  });
  return (latest._max.sequence ?? 0) + 1;
};

export class PrismaControlRepository implements ControlRepository {
  async requestApproval(
    input: Parameters<ControlRepository["requestApproval"]>[0],
  ) {
    return prisma.$transaction(async (transaction) => {
      const execution = await transaction.execution.findFirst({
        where: { id: input.executionId, tenantId: input.tenantId },
      });
      if (!execution) return "NOT_FOUND" as const;
      const approval = await transaction.approvalRequest.upsert({
        where: {
          executionId_nodeId: {
            executionId: input.executionId,
            nodeId: input.nodeId,
          },
        },
        create: { ...input, requestedById: input.actorId },
        update: {},
      });
      await transaction.execution.update({
        where: { id: execution.id },
        data: { status: "WAITING" },
      });
      await transaction.executionEvent.create({
        data: {
          executionId: execution.id,
          sequence: await nextSequence(transaction, execution.id),
          nodeId: input.nodeId,
          type: "approval.requested",
          severity: "INFO",
          fields: { approvalId: approval.id },
        },
      });
      return approval;
    });
  }

  async decide(input: Parameters<ControlRepository["decide"]>[0]) {
    return prisma.$transaction(async (transaction) => {
      const approval = await transaction.approvalRequest.findFirst({
        where: { id: input.approvalId, tenantId: input.tenantId },
      });
      if (!approval) return "NOT_FOUND" as const;
      const updated = await transaction.approvalRequest.updateMany({
        where: { id: approval.id, status: "PENDING" },
        data: {
          status: input.approved ? "APPROVED" : "REJECTED",
          decidedById: input.actorId,
          decidedAt: new Date(),
        },
      });
      if (updated.count !== 1) return "ALREADY_DECIDED" as const;
      await transaction.execution.update({
        where: { id: approval.executionId },
        data: { status: input.approved ? "QUEUED" : "CANCELLED" },
      });
      await transaction.executionEvent.create({
        data: {
          executionId: approval.executionId,
          sequence: await nextSequence(transaction, approval.executionId),
          nodeId: approval.nodeId,
          type: input.approved ? "approval.approved" : "approval.rejected",
          severity: "INFO",
          fields: { approvalId: approval.id },
        },
      });
      await transaction.auditEvent.create({
        data: {
          tenantId: input.tenantId,
          actorId: input.actorId,
          action: "approval.decided",
          target: "ApprovalRequest",
          targetId: approval.id,
          metadata: { approved: input.approved },
        },
      });
      return transaction.approvalRequest.findUniqueOrThrow({
        where: { id: approval.id },
      });
    });
  }

  async createTemplate(
    input: Parameters<ControlRepository["createTemplate"]>[0],
  ) {
    try {
      return await prisma.workflowTemplate.create({
        data: {
          tenantId: input.tenantId,
          createdById: input.actorId,
          name: input.name,
          graph: input.graph as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        return "EXISTS" as const;
      throw error;
    }
  }

  async instantiate(input: Parameters<ControlRepository["instantiate"]>[0]) {
    try {
      return await prisma.$transaction(async (transaction) => {
        const [template, workspace] = await Promise.all([
          transaction.workflowTemplate.findFirst({
            where: { id: input.templateId, tenantId: input.tenantId },
          }),
          transaction.workspace.findFirst({
            where: { id: input.workspaceId, tenantId: input.tenantId },
          }),
        ]);
        if (!template || !workspace) return "NOT_FOUND" as const;
        const checksum = createHash("sha256")
          .update(JSON.stringify(template.graph))
          .digest("hex");
        const workflow = await transaction.workflow.create({
          data: {
            workspaceId: workspace.id,
            name: input.name,
            draft: {
              create: {
                graph: template.graph as Prisma.InputJsonValue,
                checksum,
              },
            },
          },
          include: { draft: true },
        });
        await transaction.auditEvent.create({
          data: {
            tenantId: input.tenantId,
            actorId: input.actorId,
            action: "template.instantiated",
            target: "Workflow",
            targetId: workflow.id,
            metadata: { templateId: template.id },
          },
        });
        return workflow;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        return "EXISTS" as const;
      throw error;
    }
  }

  async setQuota(tenantId: string, maximum: number) {
    return prisma.tenantQuota.upsert({
      where: { tenantId },
      create: { tenantId, maxExecutionsPerDay: maximum },
      update: { maxExecutionsPerDay: maximum },
    });
  }

  async analytics(tenantId: string) {
    const [executions, workflows, pendingApprovals, quota] = await Promise.all([
      prisma.execution.groupBy({
        by: ["status"],
        where: { tenantId },
        _count: { _all: true },
      }),
      prisma.workflow.count({ where: { workspace: { tenantId } } }),
      prisma.approvalRequest.count({
        where: { tenantId, status: "PENDING" },
      }),
      prisma.tenantQuota.findUnique({ where: { tenantId } }),
    ]);
    return {
      workflows,
      pendingApprovals,
      executions: Object.fromEntries(
        executions.map((entry) => [entry.status, entry._count._all]),
      ),
      maxExecutionsPerDay: quota?.maxExecutionsPerDay ?? 10_000,
    };
  }
}
