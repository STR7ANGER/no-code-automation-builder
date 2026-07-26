"use client";

import { useState } from "react";

const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3010";

export function OperationsConsole() {
  const [apiKey, setApiKey] = useState("");
  const [executionId, setExecutionId] = useState("");
  const [trace, setTrace] = useState<Record<string, unknown> | null>(null);
  const [analytics, setAnalytics] = useState<Record<string, unknown> | null>(
    null,
  );
  const [status, setStatus] = useState("Enter an API key to begin.");
  const headers = { authorization: `Bearer ${apiKey}` };

  async function loadTrace() {
    setStatus("Loading redacted trace…");
    const response = await fetch(`${api}/v1/executions/${executionId}`, {
      headers,
    });
    const result = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      setTrace(null);
      return setStatus("Trace could not be loaded.");
    }
    setTrace(result);
    setStatus("Trace loaded. Sensitive fields are redacted by the API.");
  }

  async function replay() {
    if (!trace) return;
    setStatus("Queueing immutable replay…");
    const response = await fetch(`${api}/v1/executions/${executionId}/replay`, {
      method: "POST",
      headers,
    });
    const result = (await response.json()) as { id?: string };
    setStatus(
      response.ok
        ? `Replay ${result.id ?? ""} queued.`
        : "Replay was rejected.",
    );
  }

  async function loadAnalytics() {
    const response = await fetch(`${api}/v1/control/analytics`, { headers });
    if (!response.ok) return setStatus("Analytics could not be loaded.");
    setAnalytics((await response.json()) as Record<string, unknown>);
    setStatus("Tenant analytics loaded.");
  }

  return (
    <section className="panel form" style={{ marginBottom: "5rem" }}>
      <label>
        API key
        <input
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
        />
      </label>
      <label>
        Execution ID
        <input
          value={executionId}
          onChange={(event) => {
            setExecutionId(event.target.value);
            setTrace(null);
          }}
        />
      </label>
      <div className="toolbar">
        <button
          type="button"
          onClick={loadTrace}
          disabled={!apiKey || !executionId}
        >
          Load trace
        </button>
        <button type="button" onClick={replay} disabled={!trace}>
          Replay
        </button>
        <button type="button" onClick={loadAnalytics} disabled={!apiKey}>
          Load analytics
        </button>
      </div>
      <p className="status" aria-live="polite">
        {status}
      </p>
      {trace && <pre>{JSON.stringify(trace, null, 2)}</pre>}
      {analytics && <pre>{JSON.stringify(analytics, null, 2)}</pre>}
    </section>
  );
}
