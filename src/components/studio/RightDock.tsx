"use client";

import { useDesignStore, type DockTab } from "@/lib/store";
import ChatPanel from "./ChatPanel";
import Inspector from "./Inspector";
import TerraformPanel from "./TerraformPanel";

const TABS: { id: DockTab; label: string }[] = [
  { id: "inspect", label: "Inspect" },
  { id: "code", label: "Terraform" },
  { id: "chat", label: "Assistant" },
];

export default function RightDock() {
  const dockTab = useDesignStore((s) => s.dockTab);
  const setDockTab = useDesignStore((s) => s.setDockTab);

  return (
    <aside className="flex w-[345px] shrink-0 flex-col border-l border-line bg-panel">
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
