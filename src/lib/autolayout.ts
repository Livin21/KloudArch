import dagre from "@dagrejs/dagre";
import type { DesignEdge, DesignNode } from "./types";

const NODE_W = 190;
const NODE_H = 84;

/**
 * Left-to-right layered layout for service nodes.
 * Zones are visual containers and keep their position.
 */
export function layoutNodes(nodes: DesignNode[], edges: DesignEdge[]): DesignNode[] {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", ranksep: 110, nodesep: 56, marginx: 80, marginy: 80 });
  g.setDefaultEdgeLabel(() => ({}));

  const movable = nodes.filter((node) => node.type !== "zone");
  if (movable.length === 0) return nodes;

  movable.forEach((node) => g.setNode(node.id, { width: NODE_W, height: NODE_H }));
  edges.forEach((edge) => {
    if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
      g.setEdge(edge.source, edge.target);
    }
  });

  dagre.layout(g);

  return nodes.map((node) => {
    if (node.type === "zone") return node;
    const placed = g.node(node.id);
    if (!placed) return node;
    return { ...node, position: { x: placed.x - NODE_W / 2, y: placed.y - NODE_H / 2 } };
  });
}
