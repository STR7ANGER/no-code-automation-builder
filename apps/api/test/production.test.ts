import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { workflowGraph } from "@relay/contracts";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { AccessService } from "../src/modules/access/service.js";
import type { TriggerService } from "../src/modules/triggers/service.js";
import { validateGraph } from "../src/modules/workflows/graph.js";

describe("production surface", () => {
  it("serves health checks with hardened browser headers", async () => {
    const response = await createApp().request("/health");
    expect(response.status).toBe(200);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.json()).toMatchObject({ status: "ok" });
  });

  it("rejects oversized webhooks before reading or invoking services", async () => {
    const ingest = vi.fn();
    const app = createApp({
      access: {} as AccessService,
      triggers: { ingest } as unknown as TriggerService,
    });
    const response = await app.request("/v1/hooks/hook", {
      method: "POST",
      headers: { "content-length": "1048577" },
    });
    expect(response.status).toBe(413);
    expect(ingest).not.toHaveBeenCalled();
  });

  it.each(["order-routing", "incident-response"])(
    "ships a valid %s demo graph",
    async (name) => {
      const path = fileURLToPath(
        new URL(`../../../demos/${name}.json`, import.meta.url),
      );
      const graph = workflowGraph.parse(
        JSON.parse(await readFile(path, "utf8")),
      );
      expect(validateGraph(graph)).toEqual([]);
    },
  );
});
