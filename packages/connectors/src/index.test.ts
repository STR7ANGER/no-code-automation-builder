import { describe, expect, it, vi } from "vitest";
import {
  assertOutboundUrl,
  type Connector,
  type ConnectorContext,
  ConnectorError,
  execute,
  githubConnector,
  slackConnector,
} from "./index.js";

const context = () => ({
  fetch: vi.fn<typeof fetch>(),
  secret: vi.fn(async () => "secret"),
  log: vi.fn(),
  idempotencyKey: "execution-1:node-1",
});

describe("connector SDK", () => {
  it("blocks insecure and private destinations", () => {
    for (const url of [
      "http://example.com",
      "https://localhost/path",
      "https://127.0.0.1/path",
      "https://10.0.0.1/path",
      "https://192.168.1.1/path",
      "https://169.254.169.254/latest/meta-data",
    ])
      expect(() => assertOutboundUrl(url)).toThrowError(ConnectorError);
    expect(assertOutboundUrl("https://api.github.com").hostname).toBe(
      "api.github.com",
    );
  });

  it("retries transient failures and propagates idempotency", async () => {
    let attempts = 0;
    const connector: Connector<{ ok: boolean }, { attempts: number }> = {
      name: "flaky",
      async run(_input, runContext) {
        attempts += 1;
        if (attempts < 3)
          throw new ConnectorError("HTTP_503", true, "unavailable");
        expect(runContext.idempotencyKey).toBe("execution-1:node-1");
        return { attempts };
      },
    };
    await expect(
      execute(connector, { ok: true }, context(), {
        timeoutMs: 100,
        maxAttempts: 3,
        baseDelayMs: 1,
      }),
    ).resolves.toEqual({ attempts: 3 });
  });

  it("does not retry permanent connector errors", async () => {
    const run = vi.fn(async () => {
      throw new ConnectorError("INVALID_INPUT", false, "bad request");
    });
    await expect(
      execute({ name: "permanent", run }, null, context(), {
        timeoutMs: 100,
        maxAttempts: 3,
        baseDelayMs: 1,
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(run).toHaveBeenCalledOnce();
  });

  it("keeps GitHub and Slack on exact provider hosts", async () => {
    const response = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    const github = context();
    github.fetch.mockResolvedValue(response);
    await githubConnector.run(
      {
        owner: "relay",
        repo: "demo",
        title: "Incident",
        body: "Details",
        credential: "github-token",
      },
      { ...github, signal: new AbortController().signal } as ConnectorContext,
    );
    expect(String(github.fetch.mock.calls[0]?.[0])).toContain(
      "https://api.github.com/repos/relay/demo/issues",
    );

    const slack = context();
    slack.secret.mockResolvedValue("https://evil.example/hooks/1");
    await expect(
      slackConnector.run(
        { webhookUrlCredential: "slack-hook", text: "hello" },
        { ...slack, signal: new AbortController().signal } as ConnectorContext,
      ),
    ).rejects.toMatchObject({ code: "HOST_NOT_ALLOWED" });
    expect(slack.fetch).not.toHaveBeenCalled();
  });
});
