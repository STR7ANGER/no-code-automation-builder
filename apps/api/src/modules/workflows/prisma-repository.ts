import type { Prisma } from "@prisma/client";
import { prisma } from "../../db.js";
import type { DraftRecord, WorkflowRepository } from "./service.js";

const draftRecord = (value: {
  workflowId: string;
  revision: number;
  graph: Prisma.JsonValue;
  checksum: string;
}) =>
  ({
    ...value,
    graph: value.graph as DraftRecord["graph"],
  }) satisfies DraftRecord;

export class PrismaWorkflowRepository implements WorkflowRepository {
  async create(input: Parameters<WorkflowRepository["create"]>[0]) {
    const workspace = await prisma.workspace.findFirst({
      where: { id: input.workspaceId, tenantId: input.tenantId },
      select: { id: true },
    });
    if (!workspace) return "WORKSPACE_NOT_FOUND" as const;
    const existing = await prisma.workflow.findUnique({
      where: {
        workspaceId_name: {
          workspaceId: input.workspaceId,
          name: input.name,
        },
      },
      select: { id: true },
    });
    if (existing) return "WORKFLOW_EXISTS" as const;
    return prisma.$transaction(async (transaction) => {
      const workflow = await transaction.workflow.create({
        data: {
          workspaceId: input.workspaceId,
          name: input.name,
          draft: {
            create: {
              graph: input.graph as Prisma.InputJsonValue,
              checksum: input.checksum,
            },
          },
        },
        include: { draft: true },
      });
      await transaction.auditEvent.create({
        data: {
          tenantId: input.tenantId,
          actorId: input.actorId,
          action: "workflow.created",
          target: "Workflow",
          targetId: workflow.id,
          metadata: { workspaceId: input.workspaceId },
        },
      });
      if (!workflow.draft) throw new Error("Draft invariant failed.");
      return {
        id: workflow.id,
        workspaceId: workflow.workspaceId,
        name: workflow.name,
        draft: draftRecord(workflow.draft),
      };
    });
  }

  async draft(tenantId: string, workflowId: string) {
    const workflow = await prisma.workflow.findFirst({
      where: { id: workflowId, workspace: { tenantId } },
      include: { draft: true },
    });
    if (!workflow?.draft) return "WORKFLOW_NOT_FOUND" as const;
    return draftRecord(workflow.draft);
  }

  async saveDraft(input: Parameters<WorkflowRepository["saveDraft"]>[0]) {
    return prisma.$transaction(async (transaction) => {
      const workflow = await transaction.workflow.findFirst({
        where: {
          id: input.workflowId,
          workspaceId: input.workspaceId,
          workspace: { tenantId: input.tenantId },
        },
        select: { id: true },
      });
      if (!workflow) return "WORKFLOW_NOT_FOUND" as const;
      const updated = await transaction.workflowDraft.updateMany({
        where: {
          workflowId: input.workflowId,
          revision: input.expectedRevision,
        },
        data: {
          revision: { increment: 1 },
          graph: input.graph as Prisma.InputJsonValue,
          checksum: input.checksum,
        },
      });
      if (updated.count !== 1) return "REVISION_CONFLICT" as const;
      const draft = await transaction.workflowDraft.findUniqueOrThrow({
        where: { workflowId: input.workflowId },
      });
      await transaction.auditEvent.create({
        data: {
          tenantId: input.tenantId,
          actorId: input.actorId,
          action: "workflow.draft.saved",
          target: "Workflow",
          targetId: input.workflowId,
          metadata: { revision: draft.revision, checksum: draft.checksum },
        },
      });
      return draftRecord(draft);
    });
  }
}
