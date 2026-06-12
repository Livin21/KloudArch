import { useDesignStore } from "./store";
import type { DesignEdge, DesignNode } from "./types";
import { validateDesign, type Lint, type LintSeverity } from "./validate";

/**
 * Validation runs once per design change and is shared by the status bar,
 * the inspector, and every node badge — keyed on array identity, which the
 * store changes on every mutation (including drags, since containment
 * depends on positions).
 */
let lastNodes: DesignNode[] | null = null;
let lastEdges: DesignEdge[] | null = null;
let lastLints: Lint[] = [];
let lastByNode = new Map<string, Lint[]>();

export function getLints(nodes: DesignNode[], edges: DesignEdge[]): Lint[] {
  if (nodes === lastNodes && edges === lastEdges) return lastLints;
  lastNodes = nodes;
  lastEdges = edges;
  lastLints = validateDesign(nodes, edges);
  lastByNode = new Map();
  for (const lint of lastLints) {
    for (const id of lint.nodeIds) {
      const list = lastByNode.get(id);
      if (list) list.push(lint);
      else lastByNode.set(id, [lint]);
    }
  }
  return lastLints;
}

export function lintsByNode(nodes: DesignNode[], edges: DesignEdge[]): Map<string, Lint[]> {
  getLints(nodes, edges);
  return lastByNode;
}

export type NodeLintBadge = { severity: LintSeverity; messages: string[] };

const SEP = "¶";

/**
 * Node badge hook. The selector returns an encoded string so zustand's
 * value equality keeps node cards from re-rendering on unrelated changes.
 */
export function useNodeLints(nodeId: string): NodeLintBadge | null {
  const encoded = useDesignStore((s) => {
    const lints = lintsByNode(s.nodes, s.edges).get(nodeId);
    if (!lints || lints.length === 0) return "";
    const severity = lints.some((l) => l.severity === "warn") ? "warn" : "info";
    return `${severity}::${lints.map((l) => l.message).join(SEP)}`;
  });
  if (!encoded) return null;
  const idx = encoded.indexOf("::");
  return {
    severity: encoded.slice(0, idx) as LintSeverity,
    messages: encoded.slice(idx + 2).split(SEP),
  };
}
