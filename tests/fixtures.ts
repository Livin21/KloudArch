import type { GenInput } from "@/lib/terraform";
import type { DesignEdge, DesignNode, NodeConfig } from "@/lib/types";

/**
 * Plain, deterministic design fixtures for generator tests — built directly
 * rather than through the factory so there's no nanoid (stable snapshots) and
 * no coupling to factory internals.
 */

let autoX = 0;

export function svc(
  id: string,
  serviceId: string,
  label: string,
  config: NodeConfig = {},
  pos?: { x: number; y: number },
): DesignNode {
  const position = pos ?? { x: (autoX += 220), y: 200 };
  return {
    id,
    type: "service",
    position,
    data: { serviceId, label, config },
  } as DesignNode;
}

export function zone(
  id: string,
  serviceId: "vpc" | "subnet",
  label: string,
  rect: { x: number; y: number; width: number; height: number },
  config: NodeConfig = {},
): DesignNode {
  return {
    id,
    type: "zone",
    position: { x: rect.x, y: rect.y },
    width: rect.width,
    height: rect.height,
    data: { serviceId, label, config },
  } as DesignNode;
}

export function edge(id: string, source: string, target: string, label?: string): DesignEdge {
  return { id, source, target, ...(label ? { label } : {}), type: "smoothstep" } as DesignEdge;
}

export function design(
  nodes: DesignNode[],
  edges: DesignEdge[] = [],
  opts: { projectName?: string; region?: string } = {},
): GenInput {
  return {
    projectName: opts.projectName ?? "Test Project",
    region: opts.region ?? "us-east-1",
    nodes,
    edges,
  };
}

/** A routed VPC: dual-AZ public subnets + private subnet, IGW, NAT, ALB→EC2. */
export function routedVpcDesign(): GenInput {
  const nodes: DesignNode[] = [
    zone("vpc", "vpc", "App VPC", { x: 0, y: 0, width: 900, height: 700 }, { cidr: "10.0.0.0/16", dns_hostnames: true }),
    zone("pubA", "subnet", "Public A", { x: 40, y: 60, width: 240, height: 200 }, { cidr: "10.0.1.0/24", visibility: "public", az: "a" }),
    zone("pubB", "subnet", "Public B", { x: 40, y: 280, width: 240, height: 200 }, { cidr: "10.0.2.0/24", visibility: "public", az: "b" }),
    zone("priv", "subnet", "Private", { x: 340, y: 60, width: 500, height: 420 }, { cidr: "10.0.3.0/24", visibility: "private", az: "a" }),
    svc("igw", "internet-gateway", "Edge IGW", {}, { x: 60, y: 500 }),
    svc("nat", "nat-gateway", "Egress NAT", {}, { x: 70, y: 100 }),
    svc("alb", "alb", "Web ALB", { scheme: "internet-facing", protocol: "HTTP", listener_port: 80 }, { x: 70, y: 300 }),
    svc("web", "ec2", "Web Box", { instance_type: "t3.micro", count: 2 }, { x: 380, y: 100 }),
  ];
  return design(nodes, [edge("e1", "alb", "web", "http")]);
}
