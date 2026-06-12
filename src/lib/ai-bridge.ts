import { SERVICE_MAP } from "./catalog";
import { useDesignStore } from "./store";
import type { NodeConfig } from "./types";

/** Compact snapshot of the canvas, sent to the model with every message. */
export function designSnapshot() {
  const s = useDesignStore.getState();
  return {
    project: s.projectName,
    region: s.region,
    nodes: s.nodes.map((n) => ({
      id: n.id,
      service: n.data.serviceId,
      label: n.data.label,
      x: Math.round(n.position.x),
      y: Math.round(n.position.y),
      ...(n.type === "zone" ? { width: n.width, height: n.height } : {}),
      config: n.data.config,
    })),
    edges: s.edges.map((e) => ({
      from: e.source,
      to: e.target,
      ...(typeof e.label === "string" ? { label: e.label } : {}),
    })),
  };
}

type AddNodeInput = {
  nodes: {
    service: string;
    label?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    config?: NodeConfig;
  }[];
};

type ConnectInput = { links: { source: string; target: string; label?: string }[] };
type UpdateInput = { node: string; label?: string; config?: NodeConfig; x?: number; y?: number };
type RemoveInput = { nodes: string[] };

function bumpFit() {
  useDesignStore.setState((s) => ({ fitSignal: s.fitSignal + 1 }));
}

/**
 * Executes an AI tool call against the design store and returns a summary
 * string that is fed back to the model as the tool result.
 */
export function executeDesignTool(toolName: string, input: unknown): string {
  const store = useDesignStore.getState();

  switch (toolName) {
    case "add_nodes": {
      const { nodes } = input as AddNodeInput;
      const unknown = nodes.filter((n) => !SERVICE_MAP[n.service]).map((n) => n.service);
      const valid = nodes.filter((n) => SERVICE_MAP[n.service]);
      const created = store.addNodes(
        valid.map((n) => ({
          serviceId: n.service,
          label: n.label,
          x: n.x,
          y: n.y,
          width: n.width,
          height: n.height,
          config: n.config,
        })),
      );
      bumpFit();
      const lines = created.map((c) => `${c.data.label} (id: ${c.id}, service: ${c.data.serviceId})`);
      return [
        created.length ? `Added ${created.length} node(s):\n${lines.join("\n")}` : "No nodes added.",
        unknown.length ? `Unknown services skipped: ${unknown.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    }

    case "connect_nodes": {
      const { links } = input as ConnectInput;
      const result = store.connectNodes(links);
      return [
        result.connected.length ? `Connected: ${result.connected.join("; ")}` : "",
        result.failed.length ? `Failed: ${result.failed.join("; ")}` : "",
      ]
        .filter(Boolean)
        .join("\n") || "Nothing to connect.";
    }

    case "update_node": {
      const patch = input as UpdateInput;
      const updated = store.updateNode(patch.node, {
        label: patch.label,
        config: patch.config,
        x: patch.x,
        y: patch.y,
      });
      return updated
        ? `Updated ${updated.data.label} (config now: ${JSON.stringify(updated.data.config)})`
        : `No node matching "${patch.node}" — reference nodes by id or exact label.`;
    }

    case "remove_nodes": {
      const { nodes } = input as RemoveInput;
      const removed = store.removeNodes(nodes);
      return removed.length
        ? `Removed: ${removed.join(", ")}`
        : "No matching nodes found — reference nodes by id or exact label.";
    }

    case "clear_canvas": {
      store.clearAll();
      return "Canvas cleared.";
    }

    case "arrange_layout": {
      store.arrange();
      return "Layout rearranged left-to-right.";
    }

    default:
      return `Unknown tool: ${toolName}`;
  }
}
