import { type Context, Hono } from "hono";
import { ZodError } from "zod";
import { type AccessService, DomainError } from "./service.js";

const handle = (context: Context, error: unknown) => {
  if (error instanceof DomainError)
    return context.json(
      { error: { code: error.code, message: error.message } },
      error.status,
    );
  if (error instanceof ZodError)
    return context.json(
      { error: { code: "VALIDATION_FAILED", message: "Invalid request." } },
      422,
    );
  throw error;
};

export const createAccessRoutes = (
  access: AccessService,
  bootstrapKey: string,
) => {
  const routes = new Hono();
  routes.post("/bootstrap", async (context) => {
    try {
      if (context.req.header("x-bootstrap-key") !== bootstrapKey)
        return context.json({ error: { code: "FORBIDDEN" } }, 403);
      return context.json(
        await access.bootstrap(await context.req.json()),
        201,
      );
    } catch (error) {
      return handle(context, error);
    }
  });
  routes.get("/workspaces", async (context) => {
    try {
      const principal = await access.authenticate(
        context.req.header("authorization"),
      );
      return context.json(await access.listWorkspaces(principal));
    } catch (error) {
      return handle(context, error);
    }
  });
  routes.put("/credentials", async (context) => {
    try {
      const principal = await access.authenticate(
        context.req.header("authorization"),
      );
      return context.json(
        await access.saveCredential(principal, await context.req.json()),
      );
    } catch (error) {
      return handle(context, error);
    }
  });
  routes.get("/audit", async (context) => {
    try {
      const principal = await access.authenticate(
        context.req.header("authorization"),
      );
      return context.json(await access.audit(principal));
    } catch (error) {
      return handle(context, error);
    }
  });
  return routes;
};
