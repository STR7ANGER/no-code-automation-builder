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

  async query(input: Parameters<WorkflowRepository["query"]>[0]) {
    const workflow = await prisma.workflow.findFirst({
      where: {
        id: input.workflowId,
        ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
        workspace: { tenantId: input.tenantId },
      },
      include: {
        draft: input.include.includes("draft"),
        versions: input.include.includes("versions")
          ? { orderBy: { version: "desc" }, take: 20 }
          : false,
        executions: input.include.includes("latestExecution")
          ? { orderBy: { createdAt: "desc" }, take: 1 }
          : false,
        publishedVersion: true,
      },
    });
    if (!workflow) return "WORKFLOW_NOT_FOUND" as const;
    const versions = workflow.versions ?? [];
    return {
      ...workflow,
      draft: workflow.draft
        ? { ...draftRecord(workflow.draft), diagnostics: [] }
        : null,
      versions: {
        nodes: versions,
        pageInfo: { endCursor: null, hasNextPage: false },
      },
      latestExecution: workflow.executions?.[0] ?? null,
    };
  }

  async publish(input: Parameters<WorkflowRepository["publish"]>[0]) {
    return prisma.$transaction(
      async (transaction) => {
        const existing = await transaction.publishRequest.findUnique({
          where: {
            workflowId_idempotencyKey: {
              workflowId: input.workflowId,
              idempotencyKey: input.idempotencyKey,
            },
          },
          include: { version: true, workflow: true },
        });
        if (existing)
          return existing.requestHash === input.requestHash
            ? {
                workflow: existing.workflow,
                version: existing.version,
                replayed: true,
              }
            : ("IDEMPOTENCY_CONFLICT" as const);
        const workflow = await transaction.workflow.findFirst({
          where: {
            id: input.workflowId,
            workspaceId: input.workspaceId,
            workspace: { tenantId: input.tenantId },
          },
          include: { draft: true },
        });
        if (!workflow?.draft) return "WORKFLOW_NOT_FOUND" as const;
        if (workflow.draft.revision !== input.expectedRevision)
          return "REVISION_CONFLICT" as const;
        if (workflow.draft.checksum !== input.expectedChecksum)
          return "CHECKSUM_MISMATCH" as const;
        let version = await transaction.workflowVersion.findUnique({
          where: {
            workflowId_checksum: {
              workflowId: workflow.id,
              checksum: workflow.draft.checksum,
            },
          },
        });
        if (!version) {
          const latest = await transaction.workflowVersion.aggregate({
            where: { workflowId: workflow.id },
            _max: { version: true },
          });
          version = await transaction.workflowVersion.create({
            data: {
              workflowId: workflow.id,
              version: (latest._max.version ?? 0) + 1,
              graph: workflow.draft.graph as Prisma.InputJsonValue,
              checksum: workflow.draft.checksum,
            },
          });
        }
        const updated = await transaction.workflow.update({
          where: { id: workflow.id },
          data: { status: "PUBLISHED", publishedVersionId: version.id },
        });
        await transaction.publishRequest.create({
          data: {
            workflowId: workflow.id,
            versionId: version.id,
            idempotencyKey: input.idempotencyKey,
            requestHash: input.requestHash,
          },
        });
        await transaction.auditEvent.create({
          data: {
            tenantId: input.tenantId,
            actorId: input.actorId,
            action: "workflow.published",
            target: "WorkflowVersion",
            targetId: version.id,
            metadata: { workflowId: workflow.id, version: version.version },
          },
        });
        return { workflow: updated, version, replayed: false };
      },
      { isolationLevel: "Serializable" },
    );
  }
}
