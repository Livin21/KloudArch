"use client";

import { useCursorStore } from "@/lib/cursor";
import { useDesignStore } from "@/lib/store";

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
