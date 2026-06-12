import { MarkerType } from "@xyflow/react";
import { nanoid } from "nanoid";
import { defaultConfig, SERVICE_MAP } from "./catalog";
import type { DesignEdge, DesignNode, NodeConfig } from "./types";

export type NodeSpec = {
  id?: string;
  serviceId: string;
  label?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  config?: NodeConfig;
  notes?: string;
};

export type EdgeSpec = {
  id?: string;
  source: string;
  target: string;
  label?: string;
};

export const EDGE_COLOR = "#3D5670";

export function buildNode(spec: NodeSpec): DesignNode {
  const svc = SERVICE_MAP[spec.serviceId];
  if (!svc) throw new Error(`Unknown service: ${spec.serviceId}`);
  const size = svc.zone
    ? {
        width: spec.width ?? svc.defaultSize?.width ?? 480,
        height: spec.height ?? svc.defaultSize?.height ?? 320,
      }
    : {};
  return {
    id: spec.id ?? `n_${nanoid(8)}`,
    type: svc.zone ? "zone" : "service",
    position: { x: spec.x ?? 0, y: spec.y ?? 0 },
    data: {
      serviceId: svc.id,
      label: spec.label ?? svc.name,
      config: { ...defaultConfig(svc), ...spec.config },
      ...(spec.notes ? { notes: spec.notes } : {}),
    },
    ...(svc.zone
      ? { zIndex: -1, dragHandle: ".zone-grab", ...size }
      : {}),
  };
}

export function buildEdge(spec: EdgeSpec): DesignEdge {
  return {
    id: spec.id ?? `e_${nanoid(8)}`,
    source: spec.source,
    target: spec.target,
    ...(spec.label ? { label: spec.label } : {}),
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15, color: EDGE_COLOR },
  };
}
