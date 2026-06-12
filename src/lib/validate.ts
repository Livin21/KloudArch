import { contains } from "./terraform";
import type { DesignEdge, DesignNode } from "./types";

export type LintSeverity = "warn" | "info";

export type Lint = {
  id: string;
  severity: LintSeverity;
  message: string;
  /** Offending nodes — clicking a lint in the UI selects these. */
  nodeIds: string[];
};

/**
 * Design checks, derived from what the Terraform generator needs.
 * "warn" → the generated HCL contains a TODO/placeholder because of this.
 * "info" → deployable, but probably not what the author meant.
 */
export function validateDesign(nodes: DesignNode[], edges: DesignEdge[]): Lint[] {
  const lints: Lint[] = [];
  const flagged = new Set<string>();
  const add = (rule: string, severity: LintSeverity, message: string, nodeIds: string[]) => {
    lints.push({ id: `${rule}:${nodeIds.join(",")}`, severity, message, nodeIds });
    nodeIds.forEach((id) => flagged.add(id));
  };

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const zones = nodes.filter((n) => n.type === "zone");
  const vpcs = zones.filter((z) => z.data.serviceId === "vpc");
  const subnets = zones.filter((z) => z.data.serviceId === "subnet");
  const services = nodes.filter((n) => n.type === "service");

  const svc = (n: DesignNode) => n.data.serviceId;
  const out = (id: string, serviceIds?: string[]) =>
    edges
      .filter((e) => e.source === id)
      .map((e) => byId.get(e.target))
      .filter((n): n is DesignNode => !!n && (!serviceIds || serviceIds.includes(svc(n))));
  const inn = (id: string, serviceIds?: string[]) =>
    edges
      .filter((e) => e.target === id)
      .map((e) => byId.get(e.source))
      .filter((n): n is DesignNode => !!n && (!serviceIds || serviceIds.includes(svc(n))));
  const connected = (id: string) => edges.some((e) => e.source === id || e.target === id);
  const inAny = (n: DesignNode, list: DesignNode[]) => list.some((z) => contains(z, n));

  for (const subnet of subnets) {
    if (vpcs.length === 0 || !inAny(subnet, vpcs)) {
      add(
        "subnet-vpc",
        "warn",
        `“${subnet.data.label}” isn't inside a VPC zone — vpc_id can't be derived.`,
        [subnet.id],
      );
    }
  }

  for (const n of services) {
    const s = svc(n);

    if (s === "alb") {
      if (!inAny(n, subnets)) {
        add("alb-subnet", "warn", `“${n.data.label}” isn't inside a subnet — ALBs need subnets to launch.`, [n.id]);
      }
      if (out(n.id, ["ec2", "ecs"]).length === 0) {
        add("alb-targets", "warn", `“${n.data.label}” has no targets — connect it to EC2 or ECS.`, [n.id]);
      }
    }

    if ((s === "ec2" || s === "ecs") && subnets.length > 0 && !inAny(n, subnets)) {
      add("compute-subnet", "info", `“${n.data.label}” is outside every subnet — it will use the default VPC.`, [n.id]);
    }

    if (s === "lambda" && inn(n.id, ["api-gateway", "sqs", "sns", "eventbridge", "alb"]).length === 0) {
      add("lambda-trigger", "info", `“${n.data.label}” has no trigger — connect an API, queue, topic or bus to it.`, [n.id]);
    }

    if (s === "cloudfront" && out(n.id, ["s3", "alb"]).length === 0) {
      add("cdn-origin", "warn", `“${n.data.label}” has no origin — connect it to an S3 bucket or load balancer.`, [n.id]);
    }

    if (s === "route53" && out(n.id, ["cloudfront", "alb"]).length === 0) {
      add("dns-target", "info", `“${n.data.label}” has no alias target — connect it to CloudFront or an ALB.`, [n.id]);
    }

    if (s === "api-gateway" && n.data.config?.api_type === "HTTP" && out(n.id, ["lambda"]).length === 0) {
      add("api-backend", "info", `“${n.data.label}” has no Lambda integration connected.`, [n.id]);
    }

    if (s === "waf") {
      const scope = n.data.config?.scope;
      if (scope !== "CLOUDFRONT" && out(n.id, ["cloudfront"]).length > 0) {
        add("waf-scope", "warn", `“${n.data.label}” protects CloudFront but its scope is ${scope} — set it to CLOUDFRONT.`, [n.id]);
      }
      if (scope !== "REGIONAL" && out(n.id, ["alb"]).length > 0) {
        add("waf-scope", "warn", `“${n.data.label}” protects an ALB but its scope is ${scope} — set it to REGIONAL.`, [n.id]);
      }
    }

    if (s === "s3" && n.data.config?.public_read === true) {
      add("s3-public", "warn", `“${n.data.label}” allows public reads — keep this off unless it's intentional.`, [n.id]);
    }
  }

  for (const zone of zones) {
    const holds = nodes.some((n) => n.id !== zone.id && contains(zone, n));
    if (!holds) {
      add("zone-empty", "info", `“${zone.data.label}” is empty — drop services inside it to wire containment.`, [zone.id]);
    }
  }

  // Orphans last, and only for nodes no other rule already called out.
  for (const n of services) {
    if (!connected(n.id) && !flagged.has(n.id)) {
      add("orphan", "info", `“${n.data.label}” isn't connected to anything.`, [n.id]);
    }
  }

  return lints;
}

export function lintCounts(lints: Lint[]) {
  return {
    warns: lints.filter((l) => l.severity === "warn").length,
    infos: lints.filter((l) => l.severity === "info").length,
  };
}
