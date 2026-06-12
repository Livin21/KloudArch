import {
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import { create } from "zustand";
import { layoutNodes } from "./autolayout";
import { SERVICE_MAP } from "./catalog";
import { buildEdge, buildNode, type NodeSpec } from "./factory";
import {
  PROJECT_FILE_KIND,
  STORAGE_KEY,
  type DesignEdge,
  type DesignNode,
  type NodeConfig,
  type ProjectFile,
  type Snapshot,
} from "./types";

export const REGIONS = [
  "us-east-1",
  "us-west-2",
  "eu-west-1",
  "eu-central-1",
  "ap-south-1",
  "ap-southeast-1",
  "ap-northeast-1",
] as const;

const HISTORY_LIMIT = 64;

export type DockTab = "inspect" | "code" | "chat";

type DesignStore = {
  nodes: DesignNode[];
  edges: DesignEdge[];
  projectName: string;
  region: string;
  hydrated: boolean;
  lastSavedAt: number | null;

  past: Snapshot[];
  future: Snapshot[];

  dockTab: DockTab;
  templatesOpen: boolean;
  deployOpen: boolean;
  /** Bumped whenever the whole design changes shape — Canvas reacts with fitView. */
  fitSignal: number;

  // React Flow plumbing
  onNodesChange: (changes: NodeChange<DesignNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<DesignEdge>[]) => void;
  onConnect: (connection: Connection) => void;

  // history
  commit: () => void;
  undo: () => void;
  redo: () => void;

  // design mutations
  addNodes: (specs: NodeSpec[]) => DesignNode[];
  connectNodes: (links: { source: string; target: string; label?: string }[]) => {
    connected: string[];
    failed: string[];
  };
  updateNode: (
    ref: string,
    patch: { label?: string; notes?: string; config?: NodeConfig; x?: number; y?: number },
  ) => DesignNode | undefined;
  setNodeConfigValue: (id: string, key: string, value: NodeConfig[string]) => void;
  updateEdgeLabel: (id: string, label: string) => void;
  removeNodes: (refs: string[]) => string[];
  removeEdges: (ids: string[]) => void;
  duplicateNodes: (ids: string[]) => void;
  replaceAll: (nodes: DesignNode[], edges: DesignEdge[], opts?: { projectName?: string; region?: string }) => void;
  clearAll: () => void;
  arrange: () => void;

  // misc
  /** Select exactly these nodes (no history entry — selection isn't undoable). */
  selectOnly: (ids: string[]) => void;
  findNode: (ref: string) => DesignNode | undefined;
  setProjectName: (name: string) => void;
  setRegion: (region: string) => void;
  setDockTab: (tab: DockTab) => void;
  setTemplatesOpen: (open: boolean) => void;
  setDeployOpen: (open: boolean) => void;
  markSaved: () => void;
  hydrate: () => void;
};

function uniqueLabel(base: string, nodes: DesignNode[]): string {
  const taken = new Set(nodes.map((node) => node.data.label.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  let i = 2;
  while (taken.has(`${base} ${i}`.toLowerCase())) i++;
  return `${base} ${i}`;
}

function staggerPosition(index: number): { x: number; y: number } {
  return { x: 80 + (index % 4) * 250, y: 80 + Math.floor(index / 4) * 160 };
}

export const useDesignStore = create<DesignStore>((set, get) => ({
  nodes: [],
  edges: [],
  projectName: "Untitled Architecture",
  region: "us-east-1",
  hydrated: false,
  lastSavedAt: null,
  past: [],
  future: [],
  dockTab: "inspect",
  templatesOpen: false,
  deployOpen: false,
  fitSignal: 0,

  onNodesChange: (changes) =>
    set((s) => {
      // Deletions via keyboard arrive here — snapshot them for undo.
      const hasRemove = changes.some((c) => c.type === "remove");
      const removedIds = new Set(changes.filter((c) => c.type === "remove").map((c) => c.id));
      return {
        ...(hasRemove
          ? {
              past: [...s.past, { nodes: s.nodes, edges: s.edges }].slice(-HISTORY_LIMIT),
              future: [],
              edges: s.edges.filter((e) => !removedIds.has(e.source) && !removedIds.has(e.target)),
            }
          : {}),
        nodes: applyNodeChanges(changes, s.nodes),
      };
    }),

  onEdgesChange: (changes) =>
    set((s) => {
      const hasRemove = changes.some((c) => c.type === "remove");
      return {
        ...(hasRemove
          ? { past: [...s.past, { nodes: s.nodes, edges: s.edges }].slice(-HISTORY_LIMIT), future: [] }
          : {}),
        edges: applyEdgeChanges(changes, s.edges),
      };
    }),

  onConnect: (connection) => {
    if (!connection.source || !connection.target) return;
    get().connectNodes([{ source: connection.source, target: connection.target }]);
  },

  commit: () =>
    set((s) => ({
      past: [...s.past, { nodes: s.nodes, edges: s.edges }].slice(-HISTORY_LIMIT),
      future: [],
    })),

  undo: () =>
    set((s) => {
      const prev = s.past[s.past.length - 1];
      if (!prev) return s;
      return {
        nodes: prev.nodes,
        edges: prev.edges,
        past: s.past.slice(0, -1),
        future: [{ nodes: s.nodes, edges: s.edges }, ...s.future].slice(0, HISTORY_LIMIT),
      };
    }),

  redo: () =>
    set((s) => {
      const next = s.future[0];
      if (!next) return s;
      return {
        nodes: next.nodes,
        edges: next.edges,
        future: s.future.slice(1),
        past: [...s.past, { nodes: s.nodes, edges: s.edges }].slice(-HISTORY_LIMIT),
      };
    }),

  addNodes: (specs) => {
    const created: DesignNode[] = [];
    get().commit();
    set((s) => {
      let nodes = s.nodes;
      const serviceCount = nodes.filter((node) => node.type === "service").length;
      specs.forEach((spec) => {
        const svc = SERVICE_MAP[spec.serviceId];
        if (!svc) return;
        const pos =
          spec.x !== undefined && spec.y !== undefined
            ? { x: spec.x, y: spec.y }
            : staggerPosition(serviceCount + created.length);
        const node = buildNode({
          ...spec,
          x: spec.x ?? pos.x,
          y: spec.y ?? pos.y,
          label: uniqueLabel(spec.label ?? svc.name, [...nodes, ...created]),
        });
        created.push(node);
      });
      // Zones go first so they render behind services.
      const zones = created.filter((node) => node.type === "zone");
      const services = created.filter((node) => node.type !== "zone");
      nodes = [...zones, ...nodes, ...services];
      return { nodes };
    });
    return created;
  },

  connectNodes: (links) => {
    const connected: string[] = [];
    const failed: string[] = [];
    const { findNode } = get();
    const additions: DesignEdge[] = [];
    for (const link of links) {
      const source = findNode(link.source);
      const target = findNode(link.target);
      if (!source || !target || source.id === target.id) {
        failed.push(`${link.source} → ${link.target}`);
        continue;
      }
      const exists =
        get().edges.some((e) => e.source === source.id && e.target === target.id) ||
        additions.some((e) => e.source === source.id && e.target === target.id);
      if (exists) {
        failed.push(`${source.data.label} → ${target.data.label} (already connected)`);
        continue;
      }
      additions.push(buildEdge({ source: source.id, target: target.id, label: link.label }));
      connected.push(`${source.data.label} → ${target.data.label}`);
    }
    if (additions.length > 0) {
      get().commit();
      set((s) => ({ edges: [...s.edges, ...additions] }));
    }
    return { connected, failed };
  },

  updateNode: (ref, patch) => {
    const node = get().findNode(ref);
    if (!node) return undefined;
    get().commit();
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== node.id) return n;
        return {
          ...n,
          position: {
            x: patch.x ?? n.position.x,
            y: patch.y ?? n.position.y,
          },
          data: {
            ...n.data,
            label: patch.label ?? n.data.label,
            notes: patch.notes ?? n.data.notes,
            config: { ...n.data.config, ...patch.config },
          },
        };
      }),
    }));
    return get().findNode(node.id);
  },

  setNodeConfigValue: (id, key, value) => {
    get().commit();
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, config: { ...n.data.config, [key]: value } } } : n,
      ),
    }));
  },

  updateEdgeLabel: (id, label) => {
    get().commit();
    set((s) => ({
      edges: s.edges.map((e) => (e.id === id ? { ...e, label: label || undefined } : e)),
    }));
  },

  removeNodes: (refs) => {
    const ids = refs
      .map((ref) => get().findNode(ref)?.id)
      .filter((id): id is string => !!id);
    if (ids.length === 0) return [];
    const removed = get()
      .nodes.filter((n) => ids.includes(n.id))
      .map((n) => n.data.label);
    get().commit();
    set((s) => ({
      nodes: s.nodes.filter((n) => !ids.includes(n.id)),
      edges: s.edges.filter((e) => !ids.includes(e.source) && !ids.includes(e.target)),
    }));
    return removed;
  },

  removeEdges: (ids) => {
    if (ids.length === 0) return;
    get().commit();
    set((s) => ({ edges: s.edges.filter((e) => !ids.includes(e.id)) }));
  },

  duplicateNodes: (ids) => {
    const sources = get().nodes.filter((n) => ids.includes(n.id) && n.type !== "zone");
    if (sources.length === 0) return;
    get().commit();
    set((s) => {
      const idMap = new Map<string, string>();
      const clones = sources.map((n) => {
        const clone = buildNode({
          serviceId: n.data.serviceId,
          label: uniqueLabel(n.data.label, s.nodes),
          x: n.position.x + 32,
          y: n.position.y + 32,
          config: { ...n.data.config },
        });
        idMap.set(n.id, clone.id);
        return { ...clone, selected: true };
      });
      const clonedEdges = s.edges
        .filter((e) => idMap.has(e.source) && idMap.has(e.target))
        .map((e) => buildEdge({ source: idMap.get(e.source)!, target: idMap.get(e.target)!, label: typeof e.label === "string" ? e.label : undefined }));
      return {
        nodes: [...s.nodes.map((n) => ({ ...n, selected: false })), ...clones],
        edges: [...s.edges, ...clonedEdges],
      };
    });
  },

  replaceAll: (nodes, edges, opts) => {
    get().commit();
    set((s) => ({
      nodes,
      edges,
      projectName: opts?.projectName ?? s.projectName,
      region: opts?.region ?? s.region,
      fitSignal: s.fitSignal + 1,
    }));
  },

  clearAll: () => {
    get().commit();
    set({ nodes: [], edges: [] });
  },

  arrange: () => {
    get().commit();
    set((s) => ({ nodes: layoutNodes(s.nodes, s.edges), fitSignal: s.fitSignal + 1 }));
  },

  selectOnly: (ids) =>
    set((s) => ({
      nodes: s.nodes.map((n) => ({ ...n, selected: ids.includes(n.id) })),
      edges: s.edges.map((e) => ({ ...e, selected: false })),
    })),

  findNode: (ref) => {
    const { nodes } = get();
    return (
      nodes.find((n) => n.id === ref) ??
      nodes.find((n) => n.data.label.toLowerCase() === ref.toLowerCase())
    );
  },

  setProjectName: (projectName) => set({ projectName }),
  setRegion: (region) => set({ region }),
  setDockTab: (dockTab) => set({ dockTab }),
  setTemplatesOpen: (templatesOpen) => set({ templatesOpen }),
  setDeployOpen: (deployOpen) => set({ deployOpen }),
  markSaved: () => set({ lastSavedAt: Date.now() }),

  hydrate: () => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const file = JSON.parse(raw) as ProjectFile;
        if (file.kind === PROJECT_FILE_KIND && Array.isArray(file.nodes)) {
          set({
            nodes: file.nodes,
            edges: file.edges ?? [],
            projectName: file.projectName || "Untitled Architecture",
            region: file.region || "us-east-1",
            hydrated: true,
            fitSignal: 1,
          });
          return;
        }
      }
    } catch {
      // Corrupt save — start fresh rather than crash the studio.
    }
    set({ hydrated: true });
  },
}));

/* ── persistence helpers ──────────────────────────────────────────────── */

function stripRuntime(node: DesignNode): DesignNode {
  const { selected, dragging, ...rest } = node;
  void selected;
  void dragging;
  return rest as DesignNode;
}

export function serializeProject(): ProjectFile {
  const s = useDesignStore.getState();
  return {
    kind: PROJECT_FILE_KIND,
    version: 1,
    projectName: s.projectName,
    region: s.region,
    nodes: s.nodes.map(stripRuntime),
    edges: s.edges.map((e) => ({ ...e, selected: undefined })),
  };
}

let lastPersisted = "";

export function persistNow() {
  if (typeof window === "undefined") return;
  const state = useDesignStore.getState();
  if (!state.hydrated) return;
  const payload = JSON.stringify(serializeProject());
  if (payload === lastPersisted) return;
  lastPersisted = payload;
  window.localStorage.setItem(STORAGE_KEY, payload);
  state.markSaved();
}

export function importProject(json: string): { ok: boolean; error?: string } {
  try {
    const file = JSON.parse(json) as ProjectFile;
    if (file.kind !== PROJECT_FILE_KIND || !Array.isArray(file.nodes) || !Array.isArray(file.edges)) {
      return { ok: false, error: "Not a KloudArch design file." };
    }
    useDesignStore.getState().replaceAll(file.nodes, file.edges, {
      projectName: file.projectName,
      region: file.region,
    });
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not parse the file as JSON." };
  }
}
