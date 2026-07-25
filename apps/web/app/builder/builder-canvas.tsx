"use client";

import type { WorkflowGraph } from "@relay/contracts";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useBuilder } from "./store";
import { WorkflowNode } from "./workflow-node";

const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3010";
type Diagnostic = {
  code: string;
  severity: "ERROR" | "WARNING";
  message: string;
};

function Canvas() {
  const builder = useBuilder();
  const [workspaceId, setWorkspaceId] = useState("");
  const [workflowId, setWorkflowId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState("Create or load a workflow.");
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const nodeTypes = useMemo(() => ({ workflow: WorkflowNode }), []);

  async function createWorkflow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const response = await fetch(`${api}/v1/workflows`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ workspaceId, name: data.get("name") }),
    });
    const result = (await response.json()) as {
      id?: string;
      draft?: {
        graph: WorkflowGraph;
        revision: number;
        diagnostics: Diagnostic[];
      };
      error?: { code?: string };
    };
    if (!response.ok || !result.draft)
      return setStatus(`Create rejected: ${result.error?.code ?? "UNKNOWN"}`);
    setWorkflowId(result.id ?? "");
    builder.load(result.draft.graph, result.draft.revision);
    setDiagnostics(result.draft.diagnostics);
    setStatus("Draft created. Canvas autosave is active.");
  }

  async function loadDraft() {
    const response = await fetch(`${api}/v1/workflows/${workflowId}/draft`, {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    const result = (await response.json()) as {
      graph?: WorkflowGraph;
      revision?: number;
      diagnostics?: Diagnostic[];
      error?: { code?: string };
    };
    if (!response.ok || !result.graph || result.revision === undefined)
      return setStatus(`Load rejected: ${result.error?.code ?? "UNKNOWN"}`);
    builder.load(result.graph, result.revision);
    setDiagnostics(result.diagnostics ?? []);
    setStatus(`Draft revision ${result.revision} loaded.`);
  }

  useEffect(() => {
    if (!builder.dirty || !workflowId || !workspaceId || !apiKey) return;
    const timer = window.setTimeout(async () => {
      setStatus("Saving draft…");
      const response = await fetch(`${api}/v1/workflows/${workflowId}/draft`, {
        method: "PUT",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          workspaceId,
          expectedRevision: builder.revision,
          graph: builder.graph(),
        }),
      });
      const result = (await response.json()) as {
        revision?: number;
        diagnostics?: Diagnostic[];
        error?: { code?: string };
      };
      if (!response.ok || result.revision === undefined) {
        setStatus(
          result.error?.code === "REVISION_CONFLICT"
            ? "Draft changed elsewhere. Reload required."
            : `Autosave failed: ${result.error?.code ?? "UNKNOWN"}`,
        );
        return;
      }
      builder.saved(result.revision);
      setDiagnostics(result.diagnostics ?? []);
      setStatus(`Revision ${result.revision} saved.`);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [
    apiKey,
    builder,
    builder.dirty,
    builder.revision,
    workflowId,
    workspaceId,
  ]);

  return (
    <section className="form" style={{ padding: "2rem 0 5rem" }}>
      <form className="panel form" onSubmit={createWorkflow}>
        <div className="grid" style={{ padding: 0 }}>
          <label>
            Workspace ID
            <input
              value={workspaceId}
              onChange={(event) => setWorkspaceId(event.target.value)}
              required
            />
          </label>
          <label>
            Editor API key
            <input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              required
            />
          </label>
          <label>
            New workflow name
            <input name="name" defaultValue="Order routing" required />
          </label>
          <button type="submit">Create workflow</button>
          <label>
            Existing workflow ID
            <input
              value={workflowId}
              onChange={(event) => setWorkflowId(event.target.value)}
            />
          </label>
          <button type="button" onClick={loadDraft}>
            Load draft
          </button>
        </div>
        <p className="status" aria-live="polite">
          {status}
        </p>
      </form>
      <fieldset className="toolbar">
        <legend>Workflow tools</legend>
        <button type="button" onClick={() => builder.addNode("ACTION")}>
          + Action
        </button>
        <button type="button" onClick={() => builder.addNode("CONDITION")}>
          + Condition
        </button>
        <button type="button" onClick={() => builder.addNode("LOOP")}>
          + Bounded loop
        </button>
        <button
          className="secondary"
          type="button"
          onClick={builder.undo}
          disabled={builder.history.length === 0}
        >
          Undo
        </button>
        <span className="status">
          {diagnostics.length === 0
            ? "Graph valid"
            : `${diagnostics.length} diagnostic(s)`}
        </span>
      </fieldset>
      <div className="canvas-shell">
        <ReactFlow
          nodes={builder.nodes}
          edges={builder.edges}
          nodeTypes={nodeTypes}
          onNodesChange={builder.changeNodes}
          onEdgesChange={builder.changeEdges}
          onConnect={builder.connect}
          fitView
        >
          <Background />
          <MiniMap />
          <Controls />
        </ReactFlow>
      </div>
      {diagnostics.length > 0 && (
        <section className="panel" aria-label="Workflow diagnostics">
          <h2>Draft diagnostics</h2>
          <ul>
            {diagnostics.map((diagnostic) => (
              <li key={`${diagnostic.code}-${diagnostic.message}`}>
                <strong>{diagnostic.severity}</strong> {diagnostic.message}
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}

export function BuilderCanvas() {
  return (
    <ReactFlowProvider>
      <Canvas />
    </ReactFlowProvider>
  );
}
