"use client";

import { ArrowRight, CircleCheck, Copy, Info, Trash2, TriangleAlert, X } from "lucide-react";
import { useMemo } from "react";
import { CATEGORIES, CATEGORY_ORDER, SERVICE_MAP, type ServiceField } from "@/lib/catalog";
import { REGIONS, useDesignStore } from "@/lib/store";
import type { ConfigValue, DesignNode } from "@/lib/types";
import { validateDesign, type Lint } from "@/lib/validate";

function LintRow({ lint, onClick }: { lint: Lint; onClick?: () => void }) {
  const warn = lint.severity === "warn";
  const Icon = warn ? TriangleAlert : Info;
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`flex w-full items-start gap-2 rounded-[2px] border px-2.5 py-2 text-left transition-colors ${
        warn ? "border-amber/30 bg-amber/5" : "border-line bg-ink"
      } ${onClick ? "hover:border-line-bright" : "cursor-default"}`}
    >
      <Icon size={12} className={`mt-0.5 shrink-0 ${warn ? "text-amber" : "text-accent"}`} />
      <span className="text-[11px] leading-snug text-fg-dim">{lint.message}</span>
    </button>
  );
}

function Field({
  node,
  field,
}: {
  node: DesignNode;
  field: ServiceField;
}) {
  const setNodeConfigValue = useDesignStore((s) => s.setNodeConfigValue);
  const value = node.data.config?.[field.key] ?? field.default;
  const commitValue = (v: ConfigValue) => {
    if (v !== value) setNodeConfigValue(node.id, field.key, v);
  };

  return (
    <label className="block">
      <span className="u-label mb-1.5 block">{field.label}</span>
      {field.type === "select" && (
        <select
          className="u-input appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%2210%22%20height%3D%226%22%3E%3Cpath%20d%3D%22M1%201l4%204%204-4%22%20stroke%3D%22%2354708c%22%20fill%3D%22none%22/%3E%3C/svg%3E')] bg-[right_10px_center] bg-no-repeat pr-7 font-mono !text-[12px]"
          value={String(value)}
          onChange={(e) => commitValue(e.target.value)}
        >
          {field.options?.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      )}
      {field.type === "text" && (
        <input
          key={node.id + field.key}
          className="u-input font-mono !text-[12px]"
          defaultValue={String(value)}
          spellCheck={false}
          onBlur={(e) => commitValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
      )}
      {field.type === "number" && (
        <input
          key={node.id + field.key}
          type="number"
          className="u-input font-mono !text-[12px]"
          defaultValue={Number(value)}
          min={field.min}
          max={field.max}
          onBlur={(e) => {
            let v = Number(e.target.value);
            if (!Number.isFinite(v)) v = Number(field.default);
            if (field.min !== undefined) v = Math.max(field.min, v);
            if (field.max !== undefined) v = Math.min(field.max, v);
            e.target.value = String(v);
            commitValue(v);
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
      )}
      {field.type === "boolean" && (
        <button
          type="button"
          role="switch"
          aria-checked={value === true}
          onClick={() => commitValue(value !== true)}
          className={`relative h-[18px] w-9 rounded-full border transition-colors ${
            value === true ? "border-accent bg-accent/30" : "border-line bg-ink"
          }`}
        >
          <span
            className={`absolute top-[2px] h-3 w-3 rounded-full transition-all ${
              value === true ? "left-[19px] bg-accent" : "left-[3px] bg-fg-faint"
            }`}
          />
        </button>
      )}
      {field.hint && (
        <span className="mt-1 block text-[10.5px] text-fg-faint">{field.hint}</span>
      )}
    </label>
  );
}

function NodeInspector({ node }: { node: DesignNode }) {
  const svc = SERVICE_MAP[node.data.serviceId];
  const edges = useDesignStore((s) => s.edges);
  const nodes = useDesignStore((s) => s.nodes);
  const updateNode = useDesignStore((s) => s.updateNode);
  const removeNodes = useDesignStore((s) => s.removeNodes);
  const removeEdges = useDesignStore((s) => s.removeEdges);
  const duplicateNodes = useDesignStore((s) => s.duplicateNodes);

  if (!svc) return null;
  const cat = CATEGORIES[svc.category];
  const Icon = svc.icon;
  const labelOf = (id: string) => nodes.find((n) => n.id === id)?.data.label ?? "?";
  const connections = edges.filter((e) => e.source === node.id || e.target === node.id);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line p-4">
        <div className="flex items-center gap-3">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-[3px]"
            style={{ background: `${cat.color}1a`, color: cat.color }}
          >
            <Icon size={18} strokeWidth={1.6} />
          </span>
          <div className="min-w-0 flex-1">
            <input
              key={node.id}
              className="w-full bg-transparent text-[14px] font-semibold text-fg outline-none"
              defaultValue={node.data.label}
              spellCheck={false}
              onBlur={(e) => {
                const label = e.target.value.trim();
                if (label && label !== node.data.label) updateNode(node.id, { label });
                else e.target.value = node.data.label;
              }}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              title="Rename"
            />
            <p className="font-mono text-[9px] uppercase tracking-[0.14em]" style={{ color: cat.color }}>
              {svc.name} · {svc.abbr}
            </p>
          </div>
        </div>
        <p className="mt-2.5 text-[11.5px] leading-relaxed text-fg-faint">{svc.blurb}</p>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <NodeLints node={node} />
        {svc.fields.map((field) => (
          <Field key={field.key} node={node} field={field} />
        ))}

        <div>
          <span className="u-label mb-1.5 block">Notes</span>
          <textarea
            key={node.id}
            rows={2}
            className="u-input h-auto resize-none py-2 !text-[12px]"
            defaultValue={node.data.notes ?? ""}
            placeholder="design intent, constraints…"
            onBlur={(e) => {
              if (e.target.value !== (node.data.notes ?? "")) {
                updateNode(node.id, { notes: e.target.value });
              }
            }}
          />
        </div>

        {connections.length > 0 && (
          <div>
            <span className="u-label mb-1.5 block">Connections · {connections.length}</span>
            <ul className="space-y-1">
              {connections.map((edge) => (
                <li
                  key={edge.id}
                  className="group flex items-center gap-1.5 rounded-[2px] border border-line bg-ink px-2 py-1.5 font-mono text-[10.5px] text-fg-dim"
                >
                  <span className="truncate">
                    {edge.source === node.id ? node.data.label : labelOf(edge.source)}
                  </span>
                  <ArrowRight size={10} className="shrink-0 text-fg-faint" />
                  <span className="truncate">
                    {edge.target === node.id ? node.data.label : labelOf(edge.target)}
                  </span>
                  {typeof edge.label === "string" && (
                    <span className="truncate text-accent/80">{edge.label}</span>
                  )}
                  <button
                    className="ml-auto hidden shrink-0 text-fg-faint hover:text-danger group-hover:block"
                    onClick={() => removeEdges([edge.id])}
                    title="Remove connection"
                  >
                    <X size={11} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex gap-2 border-t border-line p-3">
        <button className="u-btn flex-1 justify-center" onClick={() => duplicateNodes([node.id])}>
          <Copy size={12} />
          Duplicate
        </button>
        <button
          className="u-btn flex-1 justify-center hover:!border-danger/50 hover:!text-danger"
          onClick={() => removeNodes([node.id])}
        >
          <Trash2 size={12} />
          Delete
        </button>
      </div>
    </div>
  );
}

function NodeLints({ node }: { node: DesignNode }) {
  const nodes = useDesignStore((s) => s.nodes);
  const edges = useDesignStore((s) => s.edges);
  const lints = useMemo(
    () => validateDesign(nodes, edges).filter((l) => l.nodeIds.includes(node.id)),
    [nodes, edges, node.id],
  );
  if (lints.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {lints.map((lint) => (
        <LintRow key={lint.id} lint={lint} />
      ))}
    </div>
  );
}

function ProjectInspector() {
  const projectName = useDesignStore((s) => s.projectName);
  const setProjectName = useDesignStore((s) => s.setProjectName);
  const region = useDesignStore((s) => s.region);
  const setRegion = useDesignStore((s) => s.setRegion);
  const nodes = useDesignStore((s) => s.nodes);
  const edges = useDesignStore((s) => s.edges);
  const selectOnly = useDesignStore((s) => s.selectOnly);

  const lints = useMemo(() => validateDesign(nodes, edges), [nodes, edges]);

  const counts = CATEGORY_ORDER.map((cat) => ({
    cat,
    count: nodes.filter((n) => SERVICE_MAP[n.data.serviceId]?.category === cat).length,
  })).filter((c) => c.count > 0);
  const max = Math.max(1, ...counts.map((c) => c.count));

  return (
    <div className="space-y-5 overflow-y-auto p-4">
      <div>
        <span className="u-label mb-1.5 block">Project name</span>
        <input
          key={projectName}
          className="u-input"
          defaultValue={projectName}
          onBlur={(e) => setProjectName(e.target.value.trim() || "Untitled Architecture")}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
      </div>

      <div>
        <span className="u-label mb-1.5 block">AWS region</span>
        <select
          className="u-input appearance-none font-mono !text-[12px]"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
        >
          {REGIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-[10.5px] text-fg-faint">
          Used as the provider region in generated Terraform.
        </span>
      </div>

      {nodes.length > 0 && (
        <div>
          <span className="u-label mb-2 block">Design checks · {lints.length}</span>
          {lints.length === 0 ? (
            <p className="flex items-center gap-2 rounded-[2px] border border-ok/30 bg-ok/5 px-2.5 py-2 text-[11px] text-ok">
              <CircleCheck size={12} />
              All checks pass — the Terraform has no derivation gaps.
            </p>
          ) : (
            <div className="space-y-1.5">
              {lints.map((lint) => (
                <LintRow key={lint.id} lint={lint} onClick={() => selectOnly(lint.nodeIds)} />
              ))}
            </div>
          )}
        </div>
      )}

      {counts.length > 0 && (
        <div>
          <span className="u-label mb-2 block">Bill of materials</span>
          <ul className="space-y-1.5">
            {counts.map(({ cat, count }) => (
              <li key={cat} className="flex items-center gap-2">
                <span className="w-28 shrink-0 font-mono text-[9px] uppercase tracking-[0.1em] text-fg-dim">
                  {CATEGORIES[cat].label}
                </span>
                <span className="h-2 rounded-[1px]" style={{ width: `${(count / max) * 120}px`, background: `${CATEGORIES[cat].color}66`, borderLeft: `2px solid ${CATEGORIES[cat].color}` }} />
                <span className="font-mono text-[10px] text-fg-dim">{count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <span className="u-label mb-2 block">Shortcuts</span>
        <ul className="space-y-1 font-mono text-[10.5px] text-fg-faint">
          {[
            ["drag from palette", "add component"],
            ["drag node edge → node", "connect"],
            ["⌘Z / ⇧⌘Z", "undo / redo"],
            ["⌘D", "duplicate selection"],
            ["⌘K", "open assistant"],
            ["DEL", "remove selection"],
            ["shift + drag", "multi-select"],
            ["middle-drag / scroll", "pan / zoom"],
          ].map(([k, v]) => (
            <li key={k} className="flex justify-between gap-3">
              <span className="text-fg-dim">{k}</span>
              <span>{v}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function Inspector() {
  const nodes = useDesignStore((s) => s.nodes);
  const edges = useDesignStore((s) => s.edges);
  const removeNodes = useDesignStore((s) => s.removeNodes);
  const duplicateNodes = useDesignStore((s) => s.duplicateNodes);
  const removeEdges = useDesignStore((s) => s.removeEdges);
  const updateEdgeLabel = useDesignStore((s) => s.updateEdgeLabel);

  const selectedNodes = nodes.filter((n) => n.selected);
  const selectedEdges = edges.filter((e) => e.selected);

  if (selectedNodes.length === 1) {
    return <NodeInspector node={selectedNodes[0]} />;
  }

  if (selectedNodes.length > 1) {
    const ids = selectedNodes.map((n) => n.id);
    return (
      <div className="p-4">
        <p className="u-label mb-3">{selectedNodes.length} components selected</p>
        <ul className="mb-4 space-y-1 font-mono text-[11px] text-fg-dim">
          {selectedNodes.slice(0, 8).map((n) => (
            <li key={n.id} className="truncate">· {n.data.label}</li>
          ))}
          {selectedNodes.length > 8 && <li>… +{selectedNodes.length - 8} more</li>}
        </ul>
        <div className="flex gap-2">
          <button className="u-btn flex-1 justify-center" onClick={() => duplicateNodes(ids)}>
            <Copy size={12} />
            Duplicate
          </button>
          <button
            className="u-btn flex-1 justify-center hover:!border-danger/50 hover:!text-danger"
            onClick={() => removeNodes(ids)}
          >
            <Trash2 size={12} />
            Delete all
          </button>
        </div>
      </div>
    );
  }

  if (selectedEdges.length === 1) {
    const edge = selectedEdges[0];
    const labelOf = (id: string) => nodes.find((n) => n.id === id)?.data.label ?? "?";
    return (
      <div className="space-y-4 p-4">
        <div>
          <p className="u-label mb-2">Connection</p>
          <p className="flex items-center gap-2 font-mono text-[12px] text-fg-dim">
            <span className="truncate">{labelOf(edge.source)}</span>
            <ArrowRight size={11} className="shrink-0 text-fg-faint" />
            <span className="truncate">{labelOf(edge.target)}</span>
          </p>
        </div>
        <div>
          <span className="u-label mb-1.5 block">Label</span>
          <input
            key={edge.id}
            className="u-input font-mono !text-[12px]"
            defaultValue={typeof edge.label === "string" ? edge.label : ""}
            placeholder="https · sql · events…"
            onBlur={(e) => updateEdgeLabel(edge.id, e.target.value.trim())}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          />
        </div>
        <button
          className="u-btn w-full justify-center hover:!border-danger/50 hover:!text-danger"
          onClick={() => removeEdges([edge.id])}
        >
          <Trash2 size={12} />
          Remove connection
        </button>
      </div>
    );
  }

  return <ProjectInspector />;
}
