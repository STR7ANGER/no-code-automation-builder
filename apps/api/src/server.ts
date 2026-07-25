import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { parseEnvironment } from "./env.js";
import { Metrics } from "./metrics.js";
import { AesCredentialCipher } from "./modules/access/cipher.js";
import { PrismaAccessRepository } from "./modules/access/prisma-repository.js";
import { AccessService } from "./modules/access/service.js";
import { PrismaTriggerRepository } from "./modules/triggers/prisma-repository.js";
import { TriggerService } from "./modules/triggers/service.js";
import { PrismaWorkflowRepository } from "./modules/workflows/prisma-repository.js";
import { WorkflowService } from "./modules/workflows/service.js";

const environment = parseEnvironment(process.env);
const metrics = new Metrics();
const cipher = new AesCredentialCipher(environment.CREDENTIAL_ENCRYPTION_KEY);
const access = new AccessService(
  new PrismaAccessRepository(),
  cipher,
  environment.SESSION_PEPPER,
  metrics,
);
const workflows = new WorkflowService(new PrismaWorkflowRepository(), metrics);
const triggers = new TriggerService(
  new PrismaTriggerRepository(cipher),
  metrics,
);
const server = serve({
  fetch: createApp({
    metrics,
    operatorToken: environment.OPERATOR_METRICS_TOKEN,
    access,
    bootstrapKey: environment.BOOTSTRAP_ADMIN_KEY,
    workflows,
    triggers,
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
