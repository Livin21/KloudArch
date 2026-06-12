"use client";

import { useEffect, useRef, useState } from "react";
import { useDesignStore, type DockTab } from "@/lib/store";
import ChatPanel from "./ChatPanel";
import Inspector from "./Inspector";
import TerraformPanel from "./TerraformPanel";

const TABS: { id: DockTab; label: string }[] = [
  { id: "inspect", label: "Inspect" },
  { id: "code", label: "Terraform" },
  { id: "chat", label: "Assistant" },
];

const DEFAULT_WIDTH = 345;
const MIN_WIDTH = 300;
const MAX_WIDTH = 820;
const WIDTH_KEY = "kloudarch:dock-width";

export default function RightDock() {
  const dockTab = useDesignStore((s) => s.dockTab);
  const setDockTab = useDesignStore((s) => s.setDockTab);

  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [resizing, setResizing] = useState(false);
  const drag = useRef({ startX: 0, startWidth: DEFAULT_WIDTH });

  // Load the saved width after mount (avoids SSR hydration mismatch).
  useEffect(() => {
    const saved = Number(window.localStorage.getItem(WIDTH_KEY));
    if (Number.isFinite(saved) && saved >= MIN_WIDTH && saved <= MAX_WIDTH) {
      setWidth(saved);
    }
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startWidth: width };
    setResizing(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizing) return;
    const next = Math.min(
      MAX_WIDTH,
      Math.max(MIN_WIDTH, drag.current.startWidth + (drag.current.startX - e.clientX)),
    );
    setWidth(next);
  };

  const endResize = () => {
    if (!resizing) return;
    setResizing(false);
    window.localStorage.setItem(WIDTH_KEY, String(width));
  };

  const resetWidth = () => {
    setWidth(DEFAULT_WIDTH);
    window.localStorage.setItem(WIDTH_KEY, String(DEFAULT_WIDTH));
  };

  return (
    <aside
      className="relative flex shrink-0 flex-col border-l border-line bg-panel"
      style={{ width }}
    >
      {/* Resize handle */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panel"
        title="Drag to resize · double-click to reset"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endResize}
        onPointerCancel={endResize}
        onDoubleClick={resetWidth}
        className={`group absolute -left-[3px] top-0 z-30 h-full w-[7px] cursor-col-resize ${
          resizing ? "" : "hover:bg-accent/10"
        }`}
      >
        <span
          className={`absolute left-[2px] top-0 h-full w-px transition-colors ${
            resizing ? "bg-accent" : "bg-transparent group-hover:bg-accent/60"
          }`}
        />
        {resizing && (
          <span className="absolute left-3 top-2.5 rounded-[2px] border border-line bg-raised px-1.5 py-0.5 font-mono text-[9px] tracking-[0.1em] text-accent">
            W {width}
          </span>
        )}
      </div>

      <nav className="flex shrink-0 border-b border-line">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setDockTab(tab.id)}
            className={`relative flex-1 py-2.5 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors ${
              dockTab === tab.id ? "text-amber" : "text-fg-faint hover:text-fg-dim"
            }`}
          >
            {tab.label}
            {dockTab === tab.id && (
              <span className="absolute inset-x-4 -bottom-px h-px bg-amber" />
            )}
          </button>
        ))}
      </nav>
      <div className="min-h-0 flex-1">
        {dockTab === "inspect" && <Inspector />}
        {dockTab === "code" && <TerraformPanel />}
        {/* Chat stays mounted so the conversation survives tab switches. */}
        <div className={`h-full ${dockTab === "chat" ? "" : "hidden"}`}>
          <ChatPanel />
        </div>
      </div>
    </aside>
  );
}
