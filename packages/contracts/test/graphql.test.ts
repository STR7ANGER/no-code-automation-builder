import { readFile } from "node:fs/promises";
import { buildSchema, validateSchema } from "graphql";
import { describe, expect, it } from "vitest";
import { workflowPublishInput } from "../src/index.js";

describe("publish and query contracts", () => {
  it("defines a valid GraphQL schema", async () => {
    const source = await readFile(
      new URL("../schema.graphql", import.meta.url),
      "utf8",
    );
    expect(validateSchema(buildSchema(source))).toEqual([]);
  });

  it("requires an exact reviewed checksum and idempotency key", () => {
    expect(() =>
      workflowPublishInput.parse({
        workflowId: "cm0000000000000000000001",
        workspaceId: "cm0000000000000000000002",
        expectedRevision: 4,
        expectedChecksum: "not-a-checksum",
        idempotencyKey: "short",
      }),
    ).toThrow();
    expect(
      workflowPublishInput.parse({
        workflowId: "cm0000000000000000000001",
        workspaceId: "cm0000000000000000000002",
        expectedRevision: 4,
        expectedChecksum: "a".repeat(64),
        idempotencyKey: "publish-request-44",
      }),
    ).toMatchObject({ expectedRevision: 4 });
  });
});
