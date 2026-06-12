"use client";

import { NodeResizer, type NodeProps } from "@xyflow/react";
import { memo } from "react";
import { CATEGORIES, SERVICE_MAP } from "@/lib/catalog";
import { useDesignStore } from "@/lib/store";
import type { DesignNode } from "@/lib/types";
import Corners from "./Corners";

function ZoneNodeInner({ data, selected }: NodeProps<DesignNode>) {
  const svc = SERVICE_MAP[data.serviceId];
  if (!svc) return null;
  const isPublicSubnet =
    data.serviceId === "subnet" && data.config?.visibility === "public";
  const color = isPublicSubnet ? "#3FDFA0" : CATEGORIES[svc.category].color;
  const Icon = svc.icon;

  return (
    <div
      className="relative h-full w-full rounded-[4px]"
      style={{ background: `${color}08`, border: `1px dashed ${color}59` }}
    >
      <NodeResizer
        isVisible={!!selected}
        minWidth={220}
        minHeight={160}
        onResizeStart={() => useDesignStore.getState().commit()}
      />
      <div
        className="zone-grab absolute -top-[11px] left-3 flex cursor-move items-center gap-1.5 rounded-[2px] border bg-ink px-2 py-[3px]"
        style={{ borderColor: `${color}59` }}
      >
        <Icon size={11} style={{ color }} strokeWidth={1.8} />
        <span
          className="font-mono text-[9px] uppercase tracking-[0.16em]"
          style={{ color }}
        >
          {data.label}
        </span>
        {typeof data.config?.cidr === "string" && data.config.cidr && (
          <span className="font-mono text-[9px] tracking-[0.06em] text-fg-faint">
            {data.config.cidr}
          </span>
        )}
      </div>
      <span className="absolute bottom-1.5 right-2 font-mono text-[8.5px] tracking-[0.1em] text-fg-faint/70">
        {svc.abbr}
        {isPublicSubnet ? " · PUBLIC" : data.serviceId === "subnet" ? " · PRIVATE" : ""}
      </span>
      {selected && <Corners />}
    </div>
  );
}

export default memo(ZoneNodeInner);
