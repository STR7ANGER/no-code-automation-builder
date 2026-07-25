import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { parseEnvironment } from "../src/env.js";
import { Metrics } from "../src/metrics.js";

describe("automation foundation", () => {
  it("exposes a versioned health contract", async () => {
    const response = await createApp().request("/health");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      service: "automation-control-api",
      contract: "v1",
    });
  });

  it("protects metrics and keeps label cardinality bounded", async () => {
    const metrics = new Metrics();
    const app = createApp({ metrics, operatorToken: "operator" });
    expect((await app.request("/internal/metrics")).status).toBe(403);
    await app.request("/health");
    const response = await app.request("/internal/metrics", {
      headers: { authorization: "Bearer operator" },
    });
    expect(await response.text()).toContain(
      'automation_http_requests_total{method="GET",status_class="2xx"}',
    );
  });

  it("fails closed when secret configuration is weak", () => {
    expect(() =>
      parseEnvironment({
        WEB_URL: "http://localhost:3000",
        DATABASE_URL: "postgresql://localhost/db",
        MONGODB_URL: "mongodb://localhost/db",
        REDIS_URL: "redis://localhost:6379",
        BOOTSTRAP_ADMIN_KEY: "short",
        CREDENTIAL_ENCRYPTION_KEY: "short",
        SESSION_PEPPER: "short",
        OPERATOR_METRICS_TOKEN: "short",
      }),
    ).toThrow();
  });
});
