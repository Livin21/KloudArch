"use client";

import { useMemo } from "react";
import { useCursorStore } from "@/lib/cursor";
import { useDesignStore } from "@/lib/store";
import { lintCounts, validateDesign } from "@/lib/validate";

function Readout() {
  const x = useCursorStore((s) => s.x);
  const y = useCursorStore((s) => s.y);
  const zoom = useCursorStore((s) => s.zoom);
  return (
    <span className="flex items-center gap-4">
      <span>
        X <span className="inline-block w-12 text-fg-dim">{x}</span>
        Y <span className="inline-block w-12 text-fg-dim">{y}</span>
      </span>
      <span>
        ZOOM <span className="text-fg-dim">{Math.round(zoom * 100)}%</span>
      </span>
      <span>GRID 12</span>
    </span>
  );
}

function ChecksChip() {
  const nodes = useDesignStore((s) => s.nodes);
  const edges = useDesignStore((s) => s.edges);
  const selectOnly = useDesignStore((s) => s.selectOnly);
  const setDockTab = useDesignStore((s) => s.setDockTab);

  const lints = useMemo(() => validateDesign(nodes, edges), [nodes, edges]);
  const { warns, infos } = lintCounts(lints);

  if (nodes.length === 0) return null;

  const open = () => {
    selectOnly([]);
    setDockTab("inspect");
  };

  if (warns + infos === 0) {
    return (
      <span className="flex items-center gap-1.5 text-ok">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-ok" />
        CHECKS PASS
      </span>
    );
  }
  return (
    <button
      onClick={open}
      className={`flex items-center gap-1.5 transition-colors hover:brightness-125 ${
        warns > 0 ? "text-amber" : "text-accent"
      }`}
      title="Show design checks"
    >
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${warns > 0 ? "bg-amber" : "bg-accent"}`}
      />
      {warns + infos} CHECK{warns + infos === 1 ? "" : "S"}
    </button>
  );
}

export default function StatusBar() {
  const nodes = useDesignStore((s) => s.nodes);
  const edgeCount = useDesignStore((s) => s.edges.length);
  const projectName = useDesignStore((s) => s.projectName);
  const lastSavedAt = useDesignStore((s) => s.lastSavedAt);

  const services = nodes.filter((n) => n.type === "service").length;
  const zones = nodes.filter((n) => n.type === "zone").length;

  return (
    <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-line bg-panel px-3 font-mono text-[9.5px] uppercase tracking-[0.12em] text-fg-faint">
      <span className="flex items-center gap-4">
        <span>
          NODES <span className="text-fg-dim">{services}</span>
        </span>
        <span>
          ZONES <span className="text-fg-dim">{zones}</span>
        </span>
        <span>
          LINKS <span className="text-fg-dim">{edgeCount}</span>
        </span>
        <ChecksChip />
        <span className="flex items-center gap-1.5">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              lastSavedAt ? "bg-ok" : "bg-fg-faint"
            }`}
          />
          {lastSavedAt
            ? `SAVED ${new Date(lastSavedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}`
            : "AUTOSAVE READY"}
        </span>
      </span>

      <span className="flex-1 text-center text-fg-faint/80">
        DWG · {projectName} · SHEET 1/1
      </span>

      <Readout />
    </footer>
  );
}
