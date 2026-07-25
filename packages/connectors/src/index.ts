export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

export type ConnectorContext = {
  fetch: typeof fetch;
  secret(name: string): Promise<string>;
  log(event: string, fields?: Record<string, Json>): void;
  signal: AbortSignal;
  idempotencyKey: string;
};

export type Connector<I extends Json = Json, O extends Json = Json> = {
  name: string;
  run(input: I, context: ConnectorContext): Promise<O>;
};

export type RunPolicy = {
  timeoutMs: number;
  maxAttempts: number;
  baseDelayMs: number;
};
export class ConnectorError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
    message: string,
  ) {
    super(message);
  }
}

export async function execute<I extends Json, O extends Json>(
  connector: Connector<I, O>,
  input: I,
  context: Omit<ConnectorContext, "signal">,
  policy: RunPolicy = { timeoutMs: 15_000, maxAttempts: 3, baseDelayMs: 250 },
): Promise<O> {
  let last: unknown;
  for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), policy.timeoutMs);
    try {
      context.log("connector.started", { connector: connector.name, attempt });
      const result = await connector.run(input, {
        ...context,
        signal: controller.signal,
      });
      context.log("connector.succeeded", {
        connector: connector.name,
        attempt,
      });
      return result;
    } catch (error) {
      last = error;
      const retryable =
        error instanceof ConnectorError
          ? error.retryable
          : error instanceof DOMException && error.name === "AbortError";
      context.log("connector.failed", {
        connector: connector.name,
        attempt,
        retryable,
      });
      if (!retryable || attempt === policy.maxAttempts) throw error;
      await delay(policy.baseDelayMs * 2 ** (attempt - 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw last;
}

const delay = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export function assertOutboundUrl(
  value: string,
  allowedHosts?: readonly string[],
) {
  const url = new URL(value);
  if (url.protocol !== "https:")
    throw new ConnectorError(
      "URL_BLOCKED",
      false,
      "Only HTTPS destinations are allowed.",
    );
  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".local") ||
    hostname === "::1" ||
    /^(127|10|0)\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
    /^169\.254\./.test(hostname)
  )
    throw new ConnectorError(
      "URL_BLOCKED",
      false,
      "Private network destinations are blocked.",
    );
  if (allowedHosts && !allowedHosts.includes(hostname))
    throw new ConnectorError(
      "HOST_NOT_ALLOWED",
      false,
      "Destination is not allow-listed.",
    );
  return url;
}

export async function requestJson(
  context: ConnectorContext,
  urlValue: string,
  init: RequestInit,
  allowedHosts?: readonly string[],
): Promise<Json> {
  const url = assertOutboundUrl(urlValue, allowedHosts);
  const response = await context.fetch(url, {
    ...init,
    signal: context.signal,
    redirect: "error",
    headers: { ...init.headers, "idempotency-key": context.idempotencyKey },
  });
  if (!response.ok)
    throw new ConnectorError(
      `HTTP_${response.status}`,
      response.status === 408 ||
        response.status === 429 ||
        response.status >= 500,
      `Connector request failed with ${response.status}.`,
    );
  const contentType = response.headers.get("content-type") ?? "";
  return contentType.includes("application/json")
    ? ((await response.json()) as Json)
    : { status: response.status };
}

export const httpConnector: Connector<{
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: Json;
  allowedHosts?: string[];
}> = {
  name: "http",
  run: (input, context) =>
    requestJson(
      context,
      input.url,
      {
        method: input.method ?? "POST",
        headers: { "content-type": "application/json", ...input.headers },
        ...(input.body === undefined
          ? {}
          : { body: JSON.stringify(input.body) }),
      },
      input.allowedHosts,
    ),
};

export const emailConnector: Connector<{
  endpoint: string;
  to: string;
  subject: string;
  text: string;
  credential: string;
}> = {
  name: "email",
  async run(input, context) {
    const token = await context.secret(input.credential);
    return requestJson(context, input.endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        to: input.to,
        subject: input.subject,
        text: input.text,
      }),
    });
  },
};

export const githubConnector: Connector<{
  owner: string;
  repo: string;
  title: string;
  body: string;
  credential: string;
}> = {
  name: "github",
  async run(input, context) {
    const token = await context.secret(input.credential);
    return requestJson(
      context,
      `https://api.github.com/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/issues`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/vnd.github+json",
          "content-type": "application/json",
        },
        body: JSON.stringify({ title: input.title, body: input.body }),
      },
      ["api.github.com"],
    );
  },
};

export const slackConnector: Connector<{
  webhookUrlCredential: string;
  text: string;
}> = {
  name: "slack",
  async run(input, context) {
    const url = await context.secret(input.webhookUrlCredential);
    return requestJson(
      context,
      url,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: input.text }),
      },
      ["hooks.slack.com"],
    );
  },
};
