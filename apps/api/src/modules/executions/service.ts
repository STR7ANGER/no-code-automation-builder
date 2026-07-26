import type { Metrics } from "../../metrics.js";
import type { Principal } from "../access/service.js";
import { DomainError } from "../access/service.js";

export type TraceRecord = {
  id: string;
  status: string;
  workflowId: string;
  workflowVersionId: string;
  replayOfId?: string | null;
  steps: unknown[];
  events: unknown[];
};

export interface ExecutionRepository {
  trace(tenantId: string, executionId: string): Promise<TraceRecord | null>;
  replay(input: {
    tenantId: string;
    actorId: string;
    executionId: string;
    idempotencyKey: string;
  }): Promise<
    { id: string; replayOfId: string } | "NOT_FOUND" | "QUOTA_EXCEEDED"
  >;
}

const sensitive = /password|secret|token|authorization|cookie|api[-_]?key/i;
const bearer = /^bearer\s+[a-z0-9._~+/-]+=*$/i;

export const redact = (value: unknown, key = ""): unknown => {
  if (sensitive.test(key)) return "[REDACTED]";
  if (typeof value === "string" && bearer.test(value)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((entry) => redact(entry));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([name, entry]) => [name, redact(entry, name)]),
    );
  return value;
};

export class ExecutionService {
  constructor(
    private readonly repository: ExecutionRepository,
    private readonly metrics: Metrics,
  ) {}

  async trace(principal: Principal, executionId: string) {
    const result = await this.repository.trace(principal.tenantId, executionId);
    if (!result)
      throw new DomainError("EXECUTION_NOT_FOUND", 404, "Execution not found.");
    this.metrics.increment("execution_traces_read_total");
    return redact(result) as TraceRecord;
  }

  async replay(principal: Principal, executionId: string) {
    if (!["OWNER", "ADMIN", "EDITOR"].includes(principal.role))
      throw new DomainError(
        "FORBIDDEN",
        403,
        "Execution replay requires editor.",
      );
    const result = await this.repository.replay({
      tenantId: principal.tenantId,
      actorId: principal.userId,
      executionId,
      idempotencyKey: `replay:${executionId}:${crypto.randomUUID()}`,
    });
    if (result === "NOT_FOUND")
      throw new DomainError("EXECUTION_NOT_FOUND", 404, "Execution not found.");
    if (result === "QUOTA_EXCEEDED")
      throw new DomainError(result, 422, "Daily execution quota exceeded.");
    this.metrics.increment("executions_replayed_total");
    return result;
  }
}
