import type { WorkflowGraph } from "@relay/contracts";
import { describe, expect, it } from "vitest";
import { Metrics } from "../src/metrics.js";
import type { Principal } from "../src/modules/access/service.js";
import { validateGraph } from "../src/modules/workflows/graph.js";
import type {
  DraftRecord,
  WorkflowRepository,
} from "../src/modules/workflows/service.js";
import { WorkflowService } from "../src/modules/workflows/service.js";

const principal: Principal = {
  userId: "cm0000000000000000000001",
  tenantId: "cm0000000000000000000002",
  role: "EDITOR",
};
const workspaceId = "cm0000000000000000000003";
const workflowId = "cm0000000000000000000004";

const graph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger",
      kind: "TRIGGER",
      label: "Webhook",
      position: { x: 0, y: 0 },
      config: {},
    },
    {
      id: "condition",
      kind: "CONDITION",
      label: "High value?",
      position: { x: 200, y: 0 },
      config: {},
    },
    {
      id: "approve",
      kind: "ACTION",
      label: "Request approval",
      position: { x: 400, y: -100 },
      config: {},
    },
    {
      id: "receipt",
      kind: "ACTION",
      label: "Send receipt",
      position: { x: 400, y: 100 },
      config: {},
    },
  ],
  edges: [
    {
      id: "trigger-condition",
      source: "trigger",
      target: "condition",
      branch: "DEFAULT",
    },
    {
      id: "condition-approve",
      source: "condition",
      target: "approve",
      branch: "TRUE",
    },
    {
      id: "condition-receipt",
      source: "condition",
      target: "receipt",
      branch: "FALSE",
    },
  ],
};

class WorkflowMemory implements WorkflowRepository {
  current: DraftRecord = {
    workflowId,
    revision: 0,
    graph,
    checksum: "checksum",
  };
  async create() {
    return {
      id: workflowId,
      workspaceId,
      name: "Order routing",
      draft: this.current,
    };
  }
  async draft() {
    return this.current;
  }
  async saveDraft(input: Parameters<WorkflowRepository["saveDraft"]>[0]) {
    if (input.expectedRevision !== this.current.revision)
      return "REVISION_CONFLICT" as const;
    this.current = {
      workflowId,
      revision: this.current.revision + 1,
      graph: input.graph,
      checksum: input.checksum,
    };
    return this.current;
  }
}

describe("typed workflow drafts", () => {
  it("accepts a reachable typed branch graph", () => {
    expect(validateGraph(graph)).toEqual([]);
  });

  it("reports unsafe cycles and unbounded loops", () => {
    const unsafe: WorkflowGraph = {
      nodes: [
        ...graph.nodes,
        {
          id: "loop",
          kind: "LOOP",
          label: "Repeat",
          position: { x: 600, y: 0 },
          config: {},
        },
      ],
      edges: [
        ...graph.edges,
        {
          id: "approve-loop",
          source: "approve",
          target: "loop",
          branch: "DEFAULT",
        },
        {
          id: "loop-condition",
          source: "loop",
          target: "condition",
          branch: "LOOP",
        },
      ],
    };
    expect(validateGraph(unsafe).map((entry) => entry.code)).toEqual(
      expect.arrayContaining(["LOOP_BOUND_REQUIRED", "GRAPH_CYCLE"]),
    );
  });

  it("increments revisions and rejects stale autosaves", async () => {
    const repository = new WorkflowMemory();
    const service = new WorkflowService(repository, new Metrics());
    await expect(
      service.saveDraft(principal, workflowId, {
        workspaceId,
        expectedRevision: 0,
        graph,
      }),
    ).resolves.toMatchObject({ revision: 1, diagnostics: [] });
    await expect(
      service.saveDraft(principal, workflowId, {
        workspaceId,
        expectedRevision: 0,
        graph,
      }),
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT", status: 409 });
  });

  it("keeps viewer keys read-only", async () => {
    const service = new WorkflowService(new WorkflowMemory(), new Metrics());
    await expect(
      service.create(
        { ...principal, role: "VIEWER" },
        {
          workspaceId,
          name: "Forbidden workflow",
        },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
