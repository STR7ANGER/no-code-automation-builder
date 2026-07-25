import { z } from "zod";

export const bootstrapInput = z.object({
  tenantName: z.string().trim().min(2).max(120),
  tenantSlug: z
    .string()
    .trim()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  workspaceName: z.string().trim().min(2).max(120),
  ownerEmail: z.string().trim().toLowerCase().email().max(254),
});

export const credentialInput = z.object({
  workspaceId: z.string().cuid(),
  name: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[A-Za-z][A-Za-z0-9 _-]*$/),
  connector: z.string().trim().min(2).max(80),
  value: z.string().min(8).max(16_384),
});

export const workflowNodeKind = z.enum([
  "TRIGGER",
  "ACTION",
  "CONDITION",
  "LOOP",
]);

export const workflowNode = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
  kind: workflowNodeKind,
  label: z.string().trim().min(1).max(100),
  position: z.object({
    x: z.number().finite().min(-10_000).max(10_000),
    y: z.number().finite().min(-10_000).max(10_000),
  }),
  config: z.record(z.string().max(100), z.unknown()).default({}),
});

export const workflowEdge = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
  source: z.string(),
  target: z.string(),
  branch: z.enum(["DEFAULT", "TRUE", "FALSE", "LOOP"]).default("DEFAULT"),
});

export const workflowGraph = z.object({
  nodes: z.array(workflowNode).min(1).max(100),
  edges: z.array(workflowEdge).max(200),
});

export const workflowCreateInput = z.object({
  workspaceId: z.string().cuid(),
  name: z.string().trim().min(2).max(120),
});

export const draftSaveInput = z.object({
  workspaceId: z.string().cuid(),
  expectedRevision: z.number().int().min(0),
  graph: workflowGraph,
});

export const workflowQueryInput = z.object({
  workspaceId: z.string().cuid().optional(),
  workflowId: z.string().cuid(),
  include: z
    .array(z.enum(["draft", "versions", "latestExecution"]))
    .max(3)
    .default(["draft"]),
});

export const workflowPublishInput = z.object({
  workflowId: z.string().cuid(),
  workspaceId: z.string().cuid(),
  expectedRevision: z.number().int().min(0),
  expectedChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  idempotencyKey: z.string().trim().min(8).max(120),
});

export const triggerCreateInput = z
  .object({
    workspaceId: z.string().cuid(),
    workflowId: z.string().cuid(),
    kind: z.enum(["WEBHOOK", "CRON"]),
    schedule: z.enum(["EVERY_5_MINUTES", "HOURLY", "DAILY"]).optional(),
  })
  .refine((value) => value.kind !== "CRON" || value.schedule, {
    message: "Cron triggers require a schedule.",
    path: ["schedule"],
  });

export type WorkflowGraph = z.infer<typeof workflowGraph>;
export type WorkflowNode = z.infer<typeof workflowNode>;
export type WorkflowEdge = z.infer<typeof workflowEdge>;
