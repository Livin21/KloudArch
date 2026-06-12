"use client";

import { Plus, X } from "lucide-react";
import { useEffect } from "react";
import { categoryOf, SERVICE_MAP } from "@/lib/catalog";
import { useDesignStore } from "@/lib/store";
import { TEMPLATES, type Template } from "@/lib/templates";
import type { DesignNode } from "@/lib/types";

function sizeOf(node: DesignNode) {
  const svc = SERVICE_MAP[node.data.serviceId];
  return {
    w: node.width ?? svc?.defaultSize?.width ?? 190,
    h: node.height ?? svc?.defaultSize?.height ?? 84,
  };
}

/** Schematic preview drawn straight from the template graph. */
function Preview({ template }: { template: Template }) {
  const rects = template.nodes.map((node) => ({ node, ...sizeOf(node) }));
  const minX = Math.min(...rects.map((r) => r.node.position.x));
  const minY = Math.min(...rects.map((r) => r.node.position.y));
  const maxX = Math.max(...rects.map((r) => r.node.position.x + r.w));
  const maxY = Math.max(...rects.map((r) => r.node.position.y + r.h));
  const pad = 60;
  const centers = new Map(
    rects.map((r) => [
      r.node.id,
      { x: r.node.position.x + r.w / 2, y: r.node.position.y + r.h / 2 },
    ]),
  );

  return (
    <svg
      viewBox={`${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`}
      className="h-36 w-full bg-deep"
      preserveAspectRatio="xMidYMid meet"
    >
      {template.edges.map((edge) => {
        const s = centers.get(edge.source);
        const t = centers.get(edge.target);
        if (!s || !t) return null;
        return (
          <line
            key={edge.id}
            x1={s.x}
            y1={s.y}
            x2={t.x}
            y2={t.y}
            stroke="#3d5670"
            strokeWidth={3}
          />
        );
      })}
      {rects.map(({ node, w, h }) => {
        const color = categoryOf(node.data.serviceId).color;
        const zone = node.type === "zone";
        return (
          <rect
            key={node.id}
            x={node.position.x}
            y={node.position.y}
            width={w}
            height={h}
            rx={6}
            fill={zone ? `${color}10` : `${color}40`}
            stroke={color}
            strokeWidth={zone ? 2 : 3}
            strokeDasharray={zone ? "10 6" : undefined}
          />
        );
      })}
    </svg>
  );
}

export default function TemplateModal() {
  const open = useDesignStore((s) => s.templatesOpen);
  const setOpen = useDesignStore((s) => s.setTemplatesOpen);
  const replaceAll = useDesignStore((s) => s.replaceAll);
  const clearAll = useDesignStore((s) => s.clearAll);
  const hasNodes = useDesignStore((s) => s.nodes.length > 0);

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, setOpen]);

  if (!open) return null;

  const confirmReplace = () =>
    !hasNodes || window.confirm("Replace the current design? You can undo this.");

  const apply = (template: Template) => {
    if (!confirmReplace()) return;
    // Deep-clone so canvas edits never mutate the template definitions.
    replaceAll(structuredClone(template.nodes), structuredClone(template.edges), {
      projectName: template.name,
    });
    setOpen(false);
  };

  const startBlank = () => {
    if (!confirmReplace()) return;
    clearAll();
    setOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-[2px]"
      onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
    >
      <div className="max-h-[85vh] w-[760px] overflow-y-auto border border-line bg-panel shadow-[0_24px_80px_rgba(0,0,0,0.6)]">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-panel px-5 py-3.5">
          <div>
            <p className="u-label !text-accent">Sheet library</p>
            <h2 className="text-[15px] font-semibold tracking-wide text-fg">
              Start from a template
            </h2>
          </div>
          <button className="u-btn !h-8 !px-2" onClick={() => setOpen(false)} title="Close">
            <X size={14} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 p-5">
          <button
            onClick={startBlank}
            className="group flex h-full min-h-[230px] flex-col items-center justify-center gap-3 border border-dashed border-line-bright text-fg-faint transition-colors hover:border-accent hover:text-accent"
          >
            <Plus size={22} strokeWidth={1.4} />
            <span className="font-mono text-[10px] uppercase tracking-[0.16em]">
              Blank sheet
            </span>
          </button>

          {TEMPLATES.map((template) => (
            <button
              key={template.id}
              onClick={() => apply(template)}
              className="group overflow-hidden border border-line bg-ink text-left transition-colors hover:border-accent"
            >
              <div className="border-b border-line">
                <Preview template={template} />
              </div>
              <div className="p-3.5">
                <p className="font-mono text-[8.5px] uppercase tracking-[0.16em] text-accent">
                  {template.tagline}
                </p>
                <h3 className="mt-1 text-[14px] font-semibold text-fg">{template.name}</h3>
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-fg-dim">
                  {template.description}
                </p>
                <p className="mt-2.5 font-mono text-[9px] uppercase tracking-[0.12em] text-fg-faint">
                  {template.nodes.filter((n) => n.type === "service").length} components ·{" "}
                  {template.nodes.filter((n) => n.type === "zone").length} zones ·{" "}
                  {template.edges.length} links
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
