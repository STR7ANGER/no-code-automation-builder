import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import type { Metrics } from "./metrics.js";
import { createAccessRoutes } from "./modules/access/routes.js";
import type { AccessService } from "./modules/access/service.js";
import { createWorkflowRoutes } from "./modules/workflows/routes.js";
import type { WorkflowService } from "./modules/workflows/service.js";

export const createApp = (
  options: {
    metrics?: Metrics;
    operatorToken?: string;
    access?: AccessService;
    bootstrapKey?: string;
    workflows?: WorkflowService;
  } = {},
) => {
  const app = new Hono();
  app.use("*", requestId());
  app.use(
    "*",
    cors({ origin: process.env.WEB_URL ?? "http://localhost:3000" }),
  );
  app.use("*", async (context, next) => {
    const started = performance.now();
    await next();
    options.metrics?.increment("http_requests_total", {
      method: context.req.method,
      status_class: `${Math.floor(context.res.status / 100)}xx`,
    });
    console.info(
      JSON.stringify({
        level: "info",
        event: "http.completed",
        requestId: context.get("requestId"),
        method: context.req.method,
        route: context.req.path.startsWith("/v1/") ? "/v1/*" : context.req.path,
        status: context.res.status,
        durationMs: Math.round(performance.now() - started),
      }),
    );
  });
  app.get("/health", (context) =>
    context.json({
      status: "ok",
      service: "automation-control-api",
      contract: "v1",
    }),
  );
  if (options.metrics && options.operatorToken)
    app.get("/internal/metrics", (context) => {
      if (
        context.req.header("authorization") !==
        `Bearer ${options.operatorToken}`
      )
        return context.json({ error: { code: "FORBIDDEN" } }, 403);
      context.header("content-type", "text/plain; version=0.0.4");
      return context.body(options.metrics?.render() ?? "");
    });
  if (options.access && options.bootstrapKey)
    app.route("/v1", createAccessRoutes(options.access, options.bootstrapKey));
  if (options.access && options.workflows)
    app.route(
      "/v1/workflows",
      createWorkflowRoutes(options.workflows, options.access),
    );
  return app;
};
