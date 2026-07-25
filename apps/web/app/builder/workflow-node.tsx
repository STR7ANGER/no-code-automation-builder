"use client";

import { Handle, type NodeProps, Position } from "@xyflow/react";
import type { FlowNode } from "./store";

export function WorkflowNode({ data }: NodeProps<FlowNode>) {
  return (
    <div className="workflow-node" data-kind={data.kind}>
      {data.kind !== "TRIGGER" && (
        <Handle type="target" position={Position.Left} />
      )}
      <small>{data.kind}</small>
      <strong>{data.label}</strong>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
