"use client";

import { ReactFlowProvider } from "@xyflow/react";
import { useEffect } from "react";
import { persistNow, useDesignStore } from "@/lib/store";
import Canvas from "./Canvas";
import DeployModal from "./DeployModal";
import Palette from "./Palette";
import RightDock from "./RightDock";
import StatusBar from "./StatusBar";
import TemplateModal from "./TemplateModal";
import TopBar from "./TopBar";

export default function Studio() {
  const hydrate = useDesignStore((s) => s.hydrate);
  const hydrated = useDesignStore((s) => s.hydrated);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Debounced autosave to localStorage.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = useDesignStore.subscribe(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(persistNow, 600);
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Global shortcuts: undo / redo / duplicate / assistant.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      const store = useDesignStore.getState();
      if (key === "z" && !typing) {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
      } else if (key === "d" && !typing) {
        e.preventDefault();
        store.duplicateNodes(store.nodes.filter((n) => n.selected).map((n) => n.id));
      } else if (key === "k") {
        e.preventDefault();
        store.setDockTab("chat");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <ReactFlowProvider>
      <div className="flex h-screen flex-col overflow-hidden bg-ink">
        <TopBar />
        <div className="flex min-h-0 flex-1">
          <Palette />
          <main
            className={`relative min-w-0 flex-1 transition-opacity duration-500 ${
              hydrated ? "opacity-100" : "opacity-0"
            }`}
          >
            <Canvas />
          </main>
          <RightDock />
        </div>
        <StatusBar />
      </div>
      <TemplateModal />
      <DeployModal />
    </ReactFlowProvider>
  );
}
