import {
  approvalDecisionInput,
  approvalRequestInput,
  quotaInput,
  templateCreateInput,
  templateInstantiateInput,
  type WorkflowGraph,
} from "@relay/contracts";
import type { Metrics } from "../../metrics.js";
import type { Principal } from "../access/service.js";
import { DomainError } from "../access/service.js";
import { validateGraph } from "../workflows/graph.js";

export interface ControlRepository {
  requestApproval(input: {
    tenantId: string;
    actorId: string;
    executionId: string;
    nodeId: string;
  }): Promise<Record<string, unknown> | "NOT_FOUND">;
  decide(input: {
    tenantId: string;
    actorId: string;
    approvalId: string;
    approved: boolean;
  }): Promise<Record<string, unknown> | "NOT_FOUND" | "ALREADY_DECIDED">;
  createTemplate(input: {
    tenantId: string;
    actorId: string;
    name: string;
    graph: WorkflowGraph;
  }): Promise<Record<string, unknown> | "EXISTS">;
  instantiate(input: {
    tenantId: string;
    actorId: string;
    templateId: string;
    workspaceId: string;
    name: string;
  }): Promise<Record<string, unknown> | "NOT_FOUND" | "EXISTS">;
  setQuota(tenantId: string, maximum: number): Promise<Record<string, unknown>>;
  analytics(tenantId: string): Promise<Record<string, unknown>>;
}

const editor = (principal: Principal) => {
  if (!["OWNER", "ADMIN", "EDITOR"].includes(principal.role))
    throw new DomainError("FORBIDDEN", 403, "Editor access required.");
};
const admin = (principal: Principal) => {
  if (!["OWNER", "ADMIN"].includes(principal.role))
    throw new DomainError("FORBIDDEN", 403, "Administrator access required.");
};

export class ControlService {
  constructor(
    private readonly repository: ControlRepository,
    private readonly metrics: Metrics,
  ) {}

  async requestApproval(principal: Principal, untrusted: unknown) {
    editor(principal);
    const input = approvalRequestInput.parse(untrusted);
    const result = await this.repository.requestApproval({
      tenantId: principal.tenantId,
      actorId: principal.userId,
      ...input,
    });
    if (result === "NOT_FOUND")
      throw new DomainError("EXECUTION_NOT_FOUND", 404, "Execution not found.");
    this.metrics.increment("approvals_requested_total");
    return result;
  }

  async decide(principal: Principal, approvalId: string, untrusted: unknown) {
    admin(principal);
    const input = approvalDecisionInput.parse(untrusted);
    const result = await this.repository.decide({
      tenantId: principal.tenantId,
      actorId: principal.userId,
      approvalId,
      approved: input.approved,
    });
    if (result === "NOT_FOUND")
      throw new DomainError("APPROVAL_NOT_FOUND", 404, "Approval not found.");
    if (result === "ALREADY_DECIDED")
      throw new DomainError(result, 409, "Approval was already decided.");
    this.metrics.increment("approvals_decided_total", {
      decision: input.approved ? "approved" : "rejected",
    });
    return result;
  }

  async createTemplate(principal: Principal, untrusted: unknown) {
    editor(principal);
    const input = templateCreateInput.parse(untrusted);
    if (validateGraph(input.graph).some((item) => item.severity === "ERROR"))
      throw new DomainError("GRAPH_INVALID", 422, "Template graph is invalid.");
    const result = await this.repository.createTemplate({
      tenantId: principal.tenantId,
      actorId: principal.userId,
      ...input,
    });
    if (result === "EXISTS")
      throw new DomainError(
        "TEMPLATE_EXISTS",
        409,
        "Template name already exists.",
      );
    return result;
  }

  async instantiate(
    principal: Principal,
    templateId: string,
    untrusted: unknown,
  ) {
    editor(principal);
    const input = templateInstantiateInput.parse(untrusted);
    const result = await this.repository.instantiate({
      tenantId: principal.tenantId,
      actorId: principal.userId,
      templateId,
      ...input,
    });
    if (result === "NOT_FOUND")
      throw new DomainError(
        "TEMPLATE_NOT_FOUND",
        404,
        "Template or workspace not found.",
      );
    if (result === "EXISTS")
      throw new DomainError(
        "WORKFLOW_EXISTS",
        409,
        "Workflow name already exists.",
      );
    this.metrics.increment("templates_instantiated_total");
    return result;
  }

  async setQuota(principal: Principal, untrusted: unknown) {
    admin(principal);
    const input = quotaInput.parse(untrusted);
    return this.repository.setQuota(
      principal.tenantId,
      input.maxExecutionsPerDay,
    );
  }

  analytics(principal: Principal) {
    return this.repository.analytics(principal.tenantId);
  }
}
