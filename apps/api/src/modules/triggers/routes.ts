import { Hono } from "hono";
import type { AccessService } from "../access/service.js";
import { DomainError } from "../access/service.js";
import type { TriggerService } from "./service.js";

export const createTriggerRoutes = (
  service: TriggerService,
  access: AccessService,
) => {
  const routes = new Hono();
  routes.post("/triggers", async (context) =>
    service
      .create(
        await access.authenticate(context.req.header("authorization")),
        await context.req.json(),
      )
      .then((value) => context.json(value, 201)),
  );
  routes.post("/hooks/:id", async (context) => {
    const declared = Number(context.req.header("content-length") ?? 0);
    if (declared > 1_048_576)
      return context.json({ error: { code: "PAYLOAD_TOO_LARGE" } }, 413);
    const payload = new Uint8Array(await context.req.arrayBuffer());
    if (payload.byteLength > 1_048_576)
      return context.json({ error: { code: "PAYLOAD_TOO_LARGE" } }, 413);
    return context.json(
      await service.ingest(
        context.req.param("id"),
        {
          "x-relay-delivery": context.req.header("x-relay-delivery"),
          "x-relay-timestamp": context.req.header("x-relay-timestamp"),
          "x-relay-signature": context.req.header("x-relay-signature"),
        },
        payload,
      ),
      202,
    );
  });
  routes.post("/triggers/dispatch-due", async (context) => {
    const principal = await access.authenticate(
      context.req.header("authorization"),
    );
    if (!["OWNER", "ADMIN"].includes(principal.role))
      throw new DomainError("FORBIDDEN", 403, "Dispatch requires admin.");
    return context.json(await service.dispatchDue());
  });
  return routes;
};
