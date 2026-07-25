import { type Context, Hono } from "hono";
import { ZodError } from "zod";
import type { AccessService } from "../access/service.js";
import { DomainError } from "../access/service.js";
import type { WorkflowService } from "./service.js";

const handle = (context: Context, error: unknown) => {
  if (error instanceof DomainError)
    return context.json(
      { error: { code: error.code, message: error.message } },
      error.status,
    );
  if (error instanceof ZodError)
    return context.json(
      { error: { code: "VALIDATION_FAILED", message: "Invalid workflow." } },
      422,
    );
  throw error;
};

export const createWorkflowRoutes = (
  workflows: WorkflowService,
  access: AccessService,
) => {
  const routes = new Hono();
  routes.post("/", async (context) => {
    try {
      const principal = await access.authenticate(
        context.req.header("authorization"),
      );
      return context.json(
        await workflows.create(principal, await context.req.json()),
        201,
      );
    } catch (error) {
      return handle(context, error);
    }
  });
  routes.get("/:workflowId/draft", async (context) => {
    try {
      const principal = await access.authenticate(
        context.req.header("authorization"),
      );
      return context.json(
        await workflows.draft(principal, context.req.param("workflowId")),
      );
    } catch (error) {
      return handle(context, error);
    }
  });
  routes.put("/:workflowId/draft", async (context) => {
    try {
      const principal = await access.authenticate(
        context.req.header("authorization"),
      );
      return context.json(
        await workflows.saveDraft(
          principal,
          context.req.param("workflowId"),
          await context.req.json(),
        ),
      );
    } catch (error) {
      return handle(context, error);
    }
  });
  return routes;
};
