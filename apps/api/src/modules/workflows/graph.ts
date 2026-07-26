import type { WorkflowGraph } from "@relay/contracts";

export type Diagnostic = {
  code: string;
  severity: "ERROR" | "WARNING";
  message: string;
  nodeId?: string;
  edgeId?: string;
};

export const validateGraph = (graph: WorkflowGraph): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  const nodeIds = new Set<string>();
  for (const node of graph.nodes) {
    if (nodeIds.has(node.id))
      diagnostics.push({
        code: "DUPLICATE_NODE",
        severity: "ERROR",
        message: `Node ID ${node.id} is duplicated.`,
        nodeId: node.id,
      });
    nodeIds.add(node.id);
    if (node.kind === "LOOP") {
      const maximum = node.config.maxIterations;
      if (
        typeof maximum !== "number" ||
        !Number.isInteger(maximum) ||
        maximum < 1 ||
        maximum > 100
      )
        diagnostics.push({
          code: "LOOP_BOUND_REQUIRED",
          severity: "ERROR",
          message: "Loops require maxIterations between 1 and 100.",
          nodeId: node.id,
        });
    }
    if (
      node.kind === "SUBFLOW" &&
      (typeof node.config.workflowId !== "string" ||
        node.config.workflowId.length < 10)
    )
      diagnostics.push({
        code: "SUBFLOW_TARGET_REQUIRED",
        severity: "ERROR",
        message: "Subflows require a target workflowId.",
        nodeId: node.id,
      });
  }
  const triggers = graph.nodes.filter((node) => node.kind === "TRIGGER");
  if (triggers.length !== 1)
    diagnostics.push({
      code: "SINGLE_TRIGGER_REQUIRED",
      severity: "ERROR",
      message: "A workflow draft must contain exactly one trigger.",
    });

  const edgeIds = new Set<string>();
  const outgoing = new Map<string, typeof graph.edges>();
  const incoming = new Map<string, number>();
  for (const edge of graph.edges) {
    if (edgeIds.has(edge.id))
      diagnostics.push({
        code: "DUPLICATE_EDGE",
        severity: "ERROR",
        message: `Edge ID ${edge.id} is duplicated.`,
        edgeId: edge.id,
      });
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target))
      diagnostics.push({
        code: "UNKNOWN_ENDPOINT",
        severity: "ERROR",
        message: "An edge references a node that does not exist.",
        edgeId: edge.id,
      });
    if (edge.source === edge.target)
      diagnostics.push({
        code: "SELF_EDGE",
        severity: "ERROR",
        message: "A node cannot connect to itself.",
        edgeId: edge.id,
      });
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge]);
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
  }

  const trigger = triggers[0];
  if (trigger && (incoming.get(trigger.id) ?? 0) > 0)
    diagnostics.push({
      code: "TRIGGER_HAS_INPUT",
      severity: "ERROR",
      message: "A trigger cannot have an incoming edge.",
      nodeId: trigger.id,
    });

  for (const condition of graph.nodes.filter(
    (node) => node.kind === "CONDITION",
  )) {
    const branches = new Set(
      (outgoing.get(condition.id) ?? []).map((edge) => edge.branch),
    );
    if (!branches.has("TRUE") || !branches.has("FALSE"))
      diagnostics.push({
        code: "CONDITION_BRANCHES_REQUIRED",
        severity: "WARNING",
        message: "Conditions should define both TRUE and FALSE branches.",
        nodeId: condition.id,
      });
  }

  if (trigger) {
    const reached = new Set<string>();
    const visiting = new Set<string>();
    const visit = (nodeId: string) => {
      if (visiting.has(nodeId)) {
        diagnostics.push({
          code: "GRAPH_CYCLE",
          severity: "ERROR",
          message: "Edges must form a DAG; use a bounded LOOP node.",
          nodeId,
        });
        return;
      }
      if (reached.has(nodeId)) return;
      visiting.add(nodeId);
      for (const edge of outgoing.get(nodeId) ?? []) visit(edge.target);
      visiting.delete(nodeId);
      reached.add(nodeId);
    };
    visit(trigger.id);
    for (const node of graph.nodes)
      if (!reached.has(node.id))
        diagnostics.push({
          code: "UNREACHABLE_NODE",
          severity: "WARNING",
          message: "This node is not reachable from the trigger.",
          nodeId: node.id,
        });
  }
  return diagnostics;
};
