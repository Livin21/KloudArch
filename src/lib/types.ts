import type { Edge, Node } from "@xyflow/react";

export type ConfigValue = string | number | boolean;
export type NodeConfig = Record<string, ConfigValue>;

export type ServiceNodeData = {
  serviceId: string;
  label: string;
  config: NodeConfig;
  notes?: string;
  [key: string]: unknown;
};

export type DesignNode = Node<ServiceNodeData>;
export type DesignEdge = Edge;

export type Snapshot = {
  nodes: DesignNode[];
  edges: DesignEdge[];
};

/** Shape of an exported / persisted design file. */
export type ProjectFile = {
  kind: "kloudarch-design";
  version: 1;
  projectName: string;
  region: string;
  nodes: DesignNode[];
  edges: DesignEdge[];
};

export const PROJECT_FILE_KIND = "kloudarch-design";
export const STORAGE_KEY = "kloudarch:design:v1";
