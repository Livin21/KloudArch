"use client";

import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type NodeTypes,
} from "@xyflow/react";
import { LayoutTemplate, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { categoryOf } from "@/lib/catalog";
import { useCursorStore } from "@/lib/cursor";
import { useDesignStore } from "@/lib/store";
import type { DesignNode } from "@/lib/types";
import ServiceNode from "./ServiceNode";
import ZoneNode from "./ZoneNode";

const nodeTypes: NodeTypes = {
  service: ServiceNode,
  zone: ZoneNode,
};

const DND_MIME = "application/kloudarch-service";
export { DND_MIME };

export default function Canvas() {
  const nodes = useDesignStore((s) => s.nodes);
  const edges = useDesignStore((s) => s.edges);
  const onNodesChange = useDesignStore((s) => s.onNodesChange);
  const onEdgesChange = useDesignStore((s) => s.onEdgesChange);
  const onConnect = useDesignStore((s) => s.onConnect);
  const commit = useDesignStore((s) => s.commit);
  const addNodes = useDesignStore((s) => s.addNodes);
  const setDockTab = useDesignStore((s) => s.setDockTab);
  const setTemplatesOpen = useDesignStore((s) => s.setTemplatesOpen);
  const fitSignal = useDesignStore((s) => s.fitSignal);
  const hydrated = useDesignStore((s) => s.hydrated);

  const setPosition = useCursorStore((s) => s.setPosition);
  const setZoom = useCursorStore((s) => s.setZoom);

  const { screenToFlowPosition, fitView } = useReactFlow();

  useEffect(() => {
    if (fitSignal > 0) {
      requestAnimationFrame(() => fitView({ padding: 0.18, duration: 500 }));
    }
  }, [fitSignal, fitView]);

  const frame = useRef<number | null>(null);
  const onPaneMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const { clientX, clientY } = e;
      if (frame.current !== null) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        const p = screenToFlowPosition({ x: clientX, y: clientY });
        setPosition(Math.round(p.x), Math.round(p.y));
      });
    },
    [screenToFlowPosition, setPosition],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(DND_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      const serviceId = e.dataTransfer.getData(DND_MIME);
      if (!serviceId) return;
      e.preventDefault();
      const p = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      addNodes([{ serviceId, x: Math.round(p.x - 95), y: Math.round(p.y - 40) }]);
    },
    [screenToFlowPosition, addNodes],
  );

  const empty = hydrated && nodes.length === 0;

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        onNodeDragStart={() => commit()}
        onNodeDoubleClick={() => setDockTab("inspect")}
        onPaneMouseMove={onPaneMouseMove}
        onMove={(_, viewport) => setZoom(viewport.zoom)}
        onDrop={onDrop}
        onDragOver={onDragOver}
        snapToGrid
        snapGrid={[12, 12]}
        elevateNodesOnSelect={false}
        minZoom={0.15}
        maxZoom={2.5}
        deleteKeyCode={["Backspace", "Delete"]}
        multiSelectionKeyCode="Shift"
        selectionOnDrag
        panOnDrag={[1, 2]}
        connectionRadius={32}
        isValidConnection={(c) => c.source !== c.target}
        fitView
        fitViewOptions={{ padding: 0.18 }}
      >
        <Background
          id="bg-lines"
          variant={BackgroundVariant.Lines}
          gap={240}
          color="#0e1828"
        />
        <Background
          id="bg-dots"
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1.2}
          color="#1c354e"
        />
        <Controls position="bottom-left" showInteractive={false} />
        <MiniMap
          position="bottom-right"
          pannable
          zoomable
          maskColor="rgba(4, 8, 14, 0.78)"
          nodeColor={(node) => categoryOf((node as DesignNode).data.serviceId).color}
          nodeStrokeWidth={0}
          style={{ background: "var(--color-panel)", width: 180, height: 120 }}
        />
      </ReactFlow>

      {empty && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className="pointer-events-auto relative max-w-md border border-dashed border-line-bright bg-panel/80 px-10 py-9 text-center backdrop-blur-sm">
            <span className="absolute -left-px -top-px h-3 w-3 border-l-2 border-t-2 border-accent" />
            <span className="absolute -right-px -top-px h-3 w-3 border-r-2 border-t-2 border-accent" />
            <span className="absolute -bottom-px -left-px h-3 w-3 border-b-2 border-l-2 border-accent" />
            <span className="absolute -bottom-px -right-px h-3 w-3 border-b-2 border-r-2 border-accent" />
            <p className="u-label mb-3 !text-accent">Blank sheet · No. 001</p>
            <h2 className="text-xl font-semibold tracking-wide text-fg">
              Draft your architecture
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-fg-dim">
              Drag components from the palette, start from a template, or
              describe what you want to the assistant and watch it appear.
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <button className="u-btn" onClick={() => setTemplatesOpen(true)}>
                <LayoutTemplate size={13} />
                Browse templates
              </button>
              <button
                className="u-btn !border-accent/40 !text-accent hover:!bg-accent/10"
                onClick={() => setDockTab("chat")}
              >
                <Sparkles size={13} />
                Ask the assistant
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
