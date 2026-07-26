import type { WorkflowGraph } from "@relay/contracts";
import { describe, expect, it } from "vitest";
import { Metrics } from "../src/metrics.js";
import type { Principal } from "../src/modules/access/service.js";
import {
  type ControlRepository,
  ControlService,
} from "../src/modules/control/service.js";

const editor: Principal = {
  tenantId: "tenant",
  userId: "editor",
  role: "EDITOR",
};
const graph: WorkflowGraph = {
  nodes: [
    {
      id: "trigger",
      kind: "TRIGGER",
      label: "Start",
      position: { x: 0, y: 0 },
      config: {},
    },
  ],
  edges: [],
};

class Memory implements ControlRepository {
  decided = false;
  maximum = 10_000;
  async requestApproval() {
    return { id: "approval", status: "PENDING" };
  }
  async decide() {
    if (this.decided) return "ALREADY_DECIDED" as const;
    this.decided = true;
    return { id: "approval", status: "APPROVED" };
  }
  async createTemplate() {
    return { id: "template" };
  }
  async instantiate() {
    return { id: "workflow", draft: { revision: 0 } };
  }
  async setQuota(_tenantId: string, maximum: number) {
    this.maximum = maximum;
    return { maxExecutionsPerDay: maximum };
  }
  async analytics() {
    return {
      workflows: 1,
      pendingApprovals: 0,
      executions: { SUCCEEDED: 2 },
      maxExecutionsPerDay: this.maximum,
    };
  }
}

describe("workflow control plane", () => {
  it("allows one administrator decision", async () => {
    const service = new ControlService(new Memory(), new Metrics());
    const admin = { ...editor, role: "ADMIN" as const };
    await expect(
      service.decide(admin, "approval", { approved: true }),
    ).resolves.toMatchObject({ status: "APPROVED" });
    await expect(
      service.decide(admin, "approval", { approved: false }),
    ).rejects.toMatchObject({ code: "ALREADY_DECIDED" });
  });

  it("validates templates and instantiates independent drafts", async () => {
    const service = new ControlService(new Memory(), new Metrics());
    await expect(
      service.createTemplate(editor, { name: "Webhook starter", graph }),
    ).resolves.toEqual({ id: "template" });
    await expect(
      service.instantiate(editor, "template", {
        workspaceId: "cm0000000000000000000001",
        name: "My workflow",
      }),
    ).resolves.toMatchObject({ draft: { revision: 0 } });
  });

  it("restricts quota and decisions to administrators", async () => {
    const service = new ControlService(new Memory(), new Metrics());
    await expect(
      service.setQuota(editor, { maxExecutionsPerDay: 5 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      service.decide(editor, "approval", { approved: true }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
