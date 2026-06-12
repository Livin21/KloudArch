"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { memo } from "react";
import { CATEGORIES, SERVICE_MAP } from "@/lib/catalog";
import type { DesignNode } from "@/lib/types";
import Corners from "./Corners";

function ServiceNodeInner({ data, selected }: NodeProps<DesignNode>) {
  const svc = SERVICE_MAP[data.serviceId];
  if (!svc) return null;
  const cat = CATEGORIES[svc.category];
  const Icon = svc.icon;

  const chips = svc.fields
    .filter((f) => f.type !== "boolean" && f.type !== "textarea")
    .slice(0, 2)
    .map((f) => String(data.config?.[f.key] ?? ""))
    .filter((v) => v && v.length <= 18);

  return (
    <div
      className={`relative w-[190px] rounded-[3px] border bg-[rgba(10,16,26,0.93)] px-3 py-2.5 transition-colors ${
        selected
          ? "border-amber"
          : "border-[rgba(140,170,205,0.18)] hover:border-line-bright"
      }`}
    >
      {selected && <Corners />}
      <div className="flex items-start gap-2.5">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[3px]"
          style={{ background: `${cat.color}1a`, color: cat.color }}
        >
          <Icon size={15} strokeWidth={1.6} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold leading-tight text-fg">
            {data.label}
          </span>
          <span
            className="mt-0.5 block truncate font-mono text-[8.5px] uppercase tracking-[0.14em]"
            style={{ color: cat.color }}
          >
            {svc.name}
          </span>
        </span>
        <span className="font-mono text-[8.5px] tracking-[0.1em] text-fg-faint">
          {svc.abbr}
        </span>
      </div>
      {chips.length > 0 && (
        <div className="mt-2 flex gap-1.5 border-t border-[rgba(140,170,205,0.08)] pt-1.5">
          {chips.map((chip, i) => (
            <span
              key={i}
              className="truncate rounded-[2px] border border-line bg-ink px-1.5 py-0.5 font-mono text-[8.5px] text-fg-dim"
            >
              {chip}
            </span>
          ))}
        </div>
      )}
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export default memo(ServiceNodeInner);
