import { createHash } from "node:crypto";
import {
  draftSaveInput,
  type WorkflowGraph,
  workflowCreateInput,
  workflowGraph,
  workflowPublishInput,
  workflowQueryInput,
} from "@relay/contracts";
import type { Metrics } from "../../metrics.js";
import type { Principal } from "../access/service.js";
import { DomainError } from "../access/service.js";
import { type Diagnostic, validateGraph } from "./graph.js";

export type DraftRecord = {
  workflowId: string;
  revision: number;
  graph: WorkflowGraph;
  checksum: string;
};

export interface WorkflowRepository {
  create(input: {
    tenantId: string;
    actorId: string;
    workspaceId: string;
    name: string;
    graph: WorkflowGraph;
    checksum: string;
  }): Promise<
    | { id: string; workspaceId: string; name: string; draft: DraftRecord }
    | "WORKSPACE_NOT_FOUND"
    | "WORKFLOW_EXISTS"
  >;
  draft(
    tenantId: string,
    workflowId: string,
  ): Promise<DraftRecord | "WORKFLOW_NOT_FOUND">;
  saveDraft(input: {
    tenantId: string;
    actorId: string;
    workspaceId: string;
    workflowId: string;
    expectedRevision: number;
    graph: WorkflowGraph;
    checksum: string;
  }): Promise<DraftRecord | "WORKFLOW_NOT_FOUND" | "REVISION_CONFLICT">;
  query(input: {
    tenantId: string;
    workflowId: string;
    workspaceId?: string;
    include: ("draft" | "versions" | "latestExecution")[];
  }): Promise<Record<string, unknown> | "WORKFLOW_NOT_FOUND">;
  publish(input: {
    tenantId: string;
    actorId: string;
    workflowId: string;
    workspaceId: string;
    expectedRevision: number;
    expectedChecksum: string;
    idempotencyKey: string;
    requestHash: string;
  }): Promise<
    | Record<string, unknown>
    | "WORKFLOW_NOT_FOUND"
    | "REVISION_CONFLICT"
    | "CHECKSUM_MISMATCH"
    | "IDEMPOTENCY_CONFLICT"
  >;
}

const checksum = (graph: WorkflowGraph) =>
  createHash("sha256").update(JSON.stringify(graph)).digest("hex");

const initialGraph: WorkflowGraph = {
  nodes: [
    {
      id: "webhook-trigger",
      kind: "TRIGGER",
      label: "Webhook received",
      position: { x: 80, y: 180 },
      config: { event: "incoming.request" },
    },
  ],
  edges: [],
};

const requireEditor = (principal: Principal) => {
  if (!["OWNER", "ADMIN", "EDITOR"].includes(principal.role))
    throw new DomainError(
      "FORBIDDEN",
      403,
      "Workflow editing requires editor.",
    );
};

const withDiagnostics = (
  draft: DraftRecord,
  diagnostics: Diagnostic[] = validateGraph(draft.graph),
) => ({ ...draft, diagnostics });

export class WorkflowService {
  constructor(
    private readonly repository: WorkflowRepository,
    private readonly metrics: Metrics,
  ) {}

  async create(principal: Principal, untrusted: unknown) {
    requireEditor(principal);
    const input = workflowCreateInput.parse(untrusted);
    const result = await this.repository.create({
      tenantId: principal.tenantId,
      actorId: principal.userId,
      workspaceId: input.workspaceId,
      name: input.name,
      graph: initialGraph,
      checksum: checksum(initialGraph),
    });
    if (result === "WORKSPACE_NOT_FOUND")
      throw new DomainError(
        "WORKSPACE_NOT_FOUND",
        404,
        "Workspace was not found in this tenant.",
      );
    if (result === "WORKFLOW_EXISTS")
      throw new DomainError(
        "WORKFLOW_EXISTS",
        409,
        "A workflow with this name already exists.",
      );
    this.metrics.increment("workflows_created_total");
    return { ...result, draft: withDiagnostics(result.draft) };
  }

  async draft(principal: Principal, workflowId: string) {
    const result = await this.repository.draft(principal.tenantId, workflowId);
    if (result === "WORKFLOW_NOT_FOUND")
      throw new DomainError(
        "WORKFLOW_NOT_FOUND",
        404,
        "Workflow was not found in this tenant.",
      );
    return withDiagnostics(result);
  }

  async saveDraft(
    principal: Principal,
    workflowId: string,
    untrusted: unknown,
  ) {
    requireEditor(principal);
    const input = draftSaveInput.parse(untrusted);
    const graph = workflowGraph.parse(input.graph);
    const result = await this.repository.saveDraft({
      tenantId: principal.tenantId,
      actorId: principal.userId,
      workspaceId: input.workspaceId,
      workflowId,
      expectedRevision: input.expectedRevision,
      graph,
      checksum: checksum(graph),
    });
    if (result === "WORKFLOW_NOT_FOUND")
      throw new DomainError(
        "WORKFLOW_NOT_FOUND",
        404,
        "Workflow was not found in this tenant.",
      );
    if (result === "REVISION_CONFLICT")
      throw new DomainError(
        "REVISION_CONFLICT",
        409,
        "The draft changed elsewhere. Reload before saving.",
      );
    this.metrics.increment("workflow_drafts_saved_total");
    return withDiagnostics(result);
  }

  async query(principal: Principal, untrusted: unknown) {
    const input = workflowQueryInput.parse(untrusted);
    const result = await this.repository.query({
      tenantId: principal.tenantId,
      workflowId: input.workflowId,
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      include: input.include,
    });
    if (result === "WORKFLOW_NOT_FOUND")
      throw new DomainError("WORKFLOW_NOT_FOUND", 404, "Workflow not found.");
    return result;
  }

  async publish(principal: Principal, untrusted: unknown) {
    requireEditor(principal);
    const input = workflowPublishInput.parse(untrusted);
    const draft = await this.draft(principal, input.workflowId);
    if (draft.diagnostics.some((entry) => entry.severity === "ERROR"))
      throw new DomainError(
        "GRAPH_INVALID",
        422,
        "Resolve graph errors first.",
      );
    const requestHash = createHash("sha256")
      .update(JSON.stringify(input))
      .digest("hex");
    const result = await this.repository.publish({
      tenantId: principal.tenantId,
      actorId: principal.userId,
      ...input,
      requestHash,
    });
    const failures = {
      WORKFLOW_NOT_FOUND: [404, "Workflow not found."],
      REVISION_CONFLICT: [409, "The reviewed draft revision is stale."],
      CHECKSUM_MISMATCH: [409, "The reviewed draft checksum changed."],
      IDEMPOTENCY_CONFLICT: [409, "Idempotency key was reused differently."],
    } as const;
    if (typeof result === "string") {
      const [status, message] = failures[result];
      throw new DomainError(result, status, message);
    }
    this.metrics.increment("workflow_versions_published_total");
    return result;
  }
}
