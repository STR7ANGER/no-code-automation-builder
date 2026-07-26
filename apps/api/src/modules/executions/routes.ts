import { Hono } from "hono";
import type { AccessService } from "../access/service.js";
import type { ExecutionService } from "./service.js";

export const createExecutionRoutes = (
  service: ExecutionService,
  access: AccessService,
) => {
  const routes = new Hono();
  routes.get("/:id", async (context) =>
    context.json(
      await service.trace(
        await access.authenticate(context.req.header("authorization")),
        context.req.param("id"),
      ),
    ),
  );
  routes.get("/:id/events", async (context) => {
    const trace = await service.trace(
      await access.authenticate(context.req.header("authorization")),
      context.req.param("id"),
    );
    context.header("content-type", "text/event-stream");
    context.header("cache-control", "no-store");
    return context.body(
      `event: snapshot\ndata: ${JSON.stringify({ executionId: trace.id, events: trace.events })}\n\n`,
    );
  });
  routes.post("/:id/replay", async (context) =>
    context.json(
      await service.replay(
        await access.authenticate(context.req.header("authorization")),
        context.req.param("id"),
      ),
      201,
    ),
  );
  return routes;
};
