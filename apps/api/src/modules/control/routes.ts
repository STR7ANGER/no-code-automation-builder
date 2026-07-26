import { Hono } from "hono";
import type { AccessService } from "../access/service.js";
import type { ControlService } from "./service.js";

export const createControlRoutes = (
  service: ControlService,
  access: AccessService,
) => {
  const routes = new Hono();
  const principal = (authorization: string | undefined) =>
    access.authenticate(authorization);
  routes.post("/approvals", async (context) =>
    context.json(
      await service.requestApproval(
        await principal(context.req.header("authorization")),
        await context.req.json(),
      ),
      201,
    ),
  );
  routes.post("/approvals/:id/decision", async (context) =>
    context.json(
      await service.decide(
        await principal(context.req.header("authorization")),
        context.req.param("id"),
        await context.req.json(),
      ),
    ),
  );
  routes.post("/templates", async (context) =>
    context.json(
      await service.createTemplate(
        await principal(context.req.header("authorization")),
        await context.req.json(),
      ),
      201,
    ),
  );
  routes.post("/templates/:id/instantiate", async (context) =>
    context.json(
      await service.instantiate(
        await principal(context.req.header("authorization")),
        context.req.param("id"),
        await context.req.json(),
      ),
      201,
    ),
  );
  routes.put("/quota", async (context) =>
    context.json(
      await service.setQuota(
        await principal(context.req.header("authorization")),
        await context.req.json(),
      ),
    ),
  );
  routes.get("/analytics", async (context) =>
    context.json(
      await service.analytics(
        await principal(context.req.header("authorization")),
      ),
    ),
  );
  return routes;
};
