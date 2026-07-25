"use client";

import type {
  WorkflowEdge,
  WorkflowGraph,
  WorkflowNode,
} from "@relay/contracts";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import { create } from "zustand";

export type FlowData = {
  label: string;
  kind: WorkflowNode["kind"];
  config: Record<string, unknown>;
};
export type FlowNode = Node<FlowData, "workflow">;
type Snapshot = { nodes: FlowNode[]; edges: Edge[] };

type BuilderState = Snapshot & {
  history: Snapshot[];
  revision: number;
  dirty: boolean;
  load: (graph: WorkflowGraph, revision: number) => void;
  addNode: (kind: WorkflowNode["kind"]) => void;
  connect: (connection: Connection) => void;
  changeNodes: (changes: NodeChange<FlowNode>[]) => void;
  changeEdges: (changes: EdgeChange[]) => void;
  undo: () => void;
  saved: (revision: number) => void;
  graph: () => WorkflowGraph;
};

const remember = (state: BuilderState): Snapshot[] => [
  ...state.history.slice(-49),
  { nodes: state.nodes, edges: state.edges },
];

export const useBuilder = create<BuilderState>((set, get) => ({
  nodes: [],
  edges: [],
  history: [],
  revision: 0,
  dirty: false,
  load: (graph, revision) =>
    set({
      nodes: graph.nodes.map((node) => ({
        id: node.id,
        type: "workflow",
        position: node.position,
        data: {
          label: node.label,
          kind: node.kind,
          config: node.config,
        },
      })),
      edges: graph.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.branch === "DEFAULT" ? undefined : edge.branch,
        data: { branch: edge.branch },
      })),
      history: [],
      revision,
      dirty: false,
    }),
  addNode: (kind) =>
    set((state) => {
      const suffix = `${kind.toLowerCase()}-${Date.now().toString(36)}`;
      const config = kind === "LOOP" ? { maxIterations: 10 } : {};
      return {
        history: remember(state),
        dirty: true,
        nodes: [
          ...state.nodes,
          {
            id: suffix,
            type: "workflow",
            position: {
              x: 180 + state.nodes.length * 45,
              y: 110 + state.nodes.length * 35,
            },
            data: {
              label:
                kind === "ACTION"
                  ? "New action"
                  : kind === "CONDITION"
                    ? "New condition"
                    : "Bounded loop",
              kind,
              config,
            },
          },
        ],
      };
    }),
  connect: (connection) =>
    set((state) => {
      if (!connection.source || !connection.target) return state;
      const source = state.nodes.find((node) => node.id === connection.source);
      const existing = state.edges.filter(
        (edge) => edge.source === connection.source,
      ).length;
      const branch: WorkflowEdge["branch"] =
        source?.data.kind === "CONDITION"
          ? existing === 0
            ? "TRUE"
            : "FALSE"
          : "DEFAULT";
      const edge: Edge = {
        ...connection,
        id: `edge-${connection.source}-${connection.target}-${Date.now().toString(36)}`,
        label: branch === "DEFAULT" ? undefined : branch,
        data: { branch },
      };
      return {
        history: remember(state),
        dirty: true,
        edges: addEdge(edge, state.edges),
      };
    }),
  changeNodes: (changes) =>
    set((state) => ({
      history: remember(state),
      dirty: true,
      nodes: applyNodeChanges(changes, state.nodes),
    })),
  changeEdges: (changes) =>
    set((state) => ({
      history: remember(state),
      dirty: true,
      edges: applyEdgeChanges(changes, state.edges),
    })),
  undo: () =>
    set((state) => {
      const previous = state.history.at(-1);
      if (!previous) return state;
      return {
        ...previous,
        history: state.history.slice(0, -1),
        dirty: true,
      };
    }),
  saved: (revision) => set({ revision, dirty: false }),
  graph: () => ({
    nodes: get().nodes.map((node) => ({
      id: node.id,
      kind: node.data.kind,
      label: node.data.label,
      position: node.position,
      config: node.data.config,
    })),
    edges: get().edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      branch:
        (edge.data?.branch as WorkflowEdge["branch"] | undefined) ?? "DEFAULT",
    })),
  }),
}));
