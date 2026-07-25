"use client";

import { type FormEvent, useState } from "react";

const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3010";

export function SetupConsole() {
  const [workspaceId, setWorkspaceId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState(
    "Use synthetic development credentials only.",
  );

  async function bootstrap(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const response = await fetch(`${api}/v1/bootstrap`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bootstrap-key": String(data.get("bootstrapKey")),
      },
      body: JSON.stringify({
        tenantName: data.get("tenantName"),
        tenantSlug: data.get("tenantSlug"),
        workspaceName: data.get("workspaceName"),
        ownerEmail: data.get("ownerEmail"),
      }),
    });
    const result = (await response.json()) as {
      workspaceId?: string;
      apiKey?: string;
      error?: { code?: string };
    };
    if (!response.ok)
      return setStatus(
        `Bootstrap rejected: ${result.error?.code ?? "UNKNOWN"}`,
      );
    setWorkspaceId(result.workspaceId ?? "");
    setApiKey(result.apiKey ?? "");
    setStatus(
      "Tenant ready. Copy the owner key now; it will not be shown again.",
    );
  }

  async function saveCredential(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const response = await fetch(`${api}/v1/credentials`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        workspaceId,
        name: data.get("name"),
        connector: data.get("connector"),
        value: data.get("value"),
      }),
    });
    const result = (await response.json()) as {
      name?: string;
      error?: { code?: string };
    };
    if (!response.ok)
      return setStatus(
        `Credential rejected: ${result.error?.code ?? "UNKNOWN"}`,
      );
    event.currentTarget.reset();
    setStatus(`${result.name ?? "Credential"} encrypted; plaintext discarded.`);
  }

  return (
    <section className="grid">
      <form className="panel form" onSubmit={bootstrap}>
        <p className="eyebrow">01 / BOOTSTRAP</p>
        <h2>Create the boundary</h2>
        <label>
          Bootstrap credential
          <input name="bootstrapKey" type="password" required />
        </label>
        <label>
          Tenant name
          <input name="tenantName" required />
        </label>
        <label>
          Tenant slug
          <input name="tenantSlug" required />
        </label>
        <label>
          Workspace name
          <input name="workspaceName" defaultValue="Operations" required />
        </label>
        <label>
          Owner email
          <input name="ownerEmail" type="email" required />
        </label>
        <button type="submit">Bootstrap tenant</button>
      </form>
      <div className="form">
        <section className="panel form">
          <p className="eyebrow">02 / ONE-TIME ACCESS</p>
          <h2>Owner context</h2>
          <label>
            Workspace ID
            <input
              value={workspaceId}
              onChange={(event) => setWorkspaceId(event.target.value)}
            />
          </label>
          <label>
            Owner API key
            <input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
            />
          </label>
          <p className="status" aria-live="polite">
            {status}
          </p>
        </section>
        <form className="panel form" onSubmit={saveCredential}>
          <p className="eyebrow">03 / CONNECTOR SECRET</p>
          <h2>Encrypt a credential</h2>
          <label>
            Display name
            <input name="name" defaultValue="Slack production" required />
          </label>
          <label>
            Connector
            <select name="connector">
              <option value="slack">Slack</option>
              <option value="github">GitHub</option>
              <option value="http">HTTP</option>
              <option value="email">Email</option>
            </select>
          </label>
          <label>
            Secret value
            <input name="value" type="password" minLength={8} required />
          </label>
          <button disabled={!workspaceId || !apiKey} type="submit">
            Encrypt and save
          </button>
        </form>
      </div>
    </section>
  );
}
