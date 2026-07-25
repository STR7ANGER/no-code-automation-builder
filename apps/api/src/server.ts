import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { parseEnvironment } from "./env.js";
import { Metrics } from "./metrics.js";

const environment = parseEnvironment(process.env);
const server = serve({
  fetch: createApp({
    metrics: new Metrics(),
    operatorToken: environment.OPERATOR_METRICS_TOKEN,
  }).fetch,
  port: environment.PORT,
});

console.info(
  JSON.stringify({
    level: "info",
    event: "server.started",
    port: environment.PORT,
  }),
);

process.on("SIGTERM", () => server.close());
