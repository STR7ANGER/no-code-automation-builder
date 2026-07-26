import { describe, expect, it } from "vitest";
import { Metrics } from "../src/metrics.js";
import type { Principal } from "../src/modules/access/service.js";
import {
  type ExecutionRepository,
  ExecutionService,
  redact,
} from "../src/modules/executions/service.js";

const principal: Principal = {
  userId: "user",
  tenantId: "tenant",
  role: "EDITOR",
};

class Memory implements ExecutionRepository {
  async trace(tenantId: string, id: string) {
    return tenantId === "tenant" && id === "execution"
      ? {
          id,
          status: "FAILED",
          workflowId: "workflow",
          workflowVersionId: "version",
          steps: [
            {
              nodeId: "http",
              output: {
                authorization: "Bearer abc.def",
                nested: { apiKey: "key", visible: 7 },
              },
            },
          ],
          events: [],
        }
      : null;
  }
  async replay(input: Parameters<ExecutionRepository["replay"]>[0]) {
    return input.executionId === "execution"
      ? { id: "replay", replayOfId: input.executionId }
      : ("NOT_FOUND" as const);
  }
}

describe("execution debugging", () => {
  it("redacts nested keys and bearer values without hiding safe fields", () => {
    expect(
      redact({
        password: "x",
        nested: { token: "y", visible: 7 },
        value: "Bearer abc.def",
      }),
    ).toEqual({
      password: "[REDACTED]",
      nested: { token: "[REDACTED]", visible: 7 },
      value: "[REDACTED]",
    });
  });

  it("returns a tenant-scoped redacted trace", async () => {
    const service = new ExecutionService(new Memory(), new Metrics());
    await expect(service.trace(principal, "execution")).resolves.toMatchObject({
      steps: [
        {
          output: {
            authorization: "[REDACTED]",
            nested: { apiKey: "[REDACTED]", visible: 7 },
          },
        },
      ],
    });
    await expect(
      service.trace({ ...principal, tenantId: "other" }, "execution"),
    ).rejects.toMatchObject({ code: "EXECUTION_NOT_FOUND" });
  });

  it("replays immutably and keeps viewers read-only", async () => {
    const service = new ExecutionService(new Memory(), new Metrics());
    await expect(service.replay(principal, "execution")).resolves.toEqual({
      id: "replay",
      replayOfId: "execution",
    });
    await expect(
      service.replay({ ...principal, role: "VIEWER" }, "execution"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
