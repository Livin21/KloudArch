import {
  Activity,
  Archive,
  Box,
  Container,
  Database,
  Earth,
  FolderTree,
  Inbox,
  KeyRound,
  Megaphone,
  MemoryStick,
  Plug,
  Route,
  Server,
  ShieldAlert,
  Signpost,
  Split,
  SquareDashed,
  SquareFunction,
  Table2,
  UserCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { ConfigValue, NodeConfig } from "./types";

export type CategoryId =
  | "compute"
  | "network"
  | "data"
  | "storage"
  | "messaging"
  | "security"
  | "observability"
  | "external";

export const CATEGORIES: Record<CategoryId, { label: string; color: string }> = {
  compute: { label: "Compute", color: "#FFA94D" },
  network: { label: "Network & Edge", color: "#A78BFA" },
  data: { label: "Databases", color: "#5EA8FF" },
  storage: { label: "Storage", color: "#3FDFA0" },
  messaging: { label: "Messaging & Events", color: "#FFD166" },
  security: { label: "Security & Identity", color: "#FF7A7A" },
  observability: { label: "Observability", color: "#4DD8E8" },
  external: { label: "External Actors", color: "#F08FC0" },
};

export const CATEGORY_ORDER: CategoryId[] = [
  "compute",
  "network",
  "data",
  "storage",
  "messaging",
  "security",
  "observability",
  "external",
];

export type FieldType = "text" | "number" | "select" | "boolean" | "textarea";

export type ServiceField = {
  key: string;
  label: string;
  type: FieldType;
  options?: readonly string[];
  default: ConfigValue;
  min?: number;
  max?: number;
  hint?: string;
};

export type ServiceDef = {
  id: string;
  name: string;
  /** Stencil part-number shown on the node card, e.g. "EC2". */
  abbr: string;
  category: CategoryId;
  icon: LucideIcon;
  blurb: string;
  fields: ServiceField[];
  /** Zones render as resizable dashed containers (VPC, subnet). */
  zone?: boolean;
  defaultSize?: { width: number; height: number };
};

export const SERVICES: ServiceDef[] = [
  // ── Compute ────────────────────────────────────────────────────────────
  {
    id: "ec2",
    name: "EC2 Instance",
    abbr: "EC2",
    category: "compute",
    icon: Server,
    blurb: "Virtual machines with full OS control.",
    fields: [
      {
        key: "instance_type",
        label: "Instance type",
        type: "select",
        options: ["t3.micro", "t3.small", "t3.medium", "t3.large", "m5.large", "m5.xlarge", "c5.large", "r5.large"],
        default: "t3.micro",
      },
      { key: "count", label: "Instance count", type: "number", default: 1, min: 1, max: 20 },
    ],
  },
  {
    id: "lambda",
    name: "Lambda Function",
    abbr: "LMB",
    category: "compute",
    icon: SquareFunction,
    blurb: "Serverless functions, billed per invocation.",
    fields: [
      {
        key: "runtime",
        label: "Runtime",
        type: "select",
        options: ["nodejs22.x", "nodejs20.x", "python3.13", "python3.12", "java21", "provided.al2023"],
        default: "nodejs22.x",
      },
      { key: "memory_mb", label: "Memory (MB)", type: "number", default: 256, min: 128, max: 10240 },
      { key: "timeout_s", label: "Timeout (s)", type: "number", default: 10, min: 1, max: 900 },
      { key: "handler", label: "Handler", type: "text", default: "index.handler" },
    ],
  },
  {
    id: "ecs",
    name: "ECS Service",
    abbr: "ECS",
    category: "compute",
    icon: Container,
    blurb: "Managed container orchestration (Fargate or EC2).",
    fields: [
      { key: "launch_type", label: "Launch type", type: "select", options: ["FARGATE", "EC2"], default: "FARGATE" },
      { key: "image", label: "Container image", type: "text", default: "nginx:latest" },
      { key: "cpu", label: "CPU units", type: "select", options: ["256", "512", "1024", "2048"], default: "256" },
      { key: "memory_mb", label: "Memory (MB)", type: "number", default: 512, min: 512, max: 30720 },
      { key: "desired_count", label: "Desired tasks", type: "number", default: 2, min: 1, max: 50 },
    ],
  },

  // ── Network & Edge ─────────────────────────────────────────────────────
  {
    id: "vpc",
    name: "VPC",
    abbr: "VPC",
    category: "network",
    icon: Box,
    blurb: "Isolated network boundary. Drop resources inside.",
    zone: true,
    defaultSize: { width: 680, height: 440 },
    fields: [
      { key: "cidr", label: "CIDR block", type: "text", default: "10.0.0.0/16" },
      { key: "dns_hostnames", label: "DNS hostnames", type: "boolean", default: true },
    ],
  },
  {
    id: "subnet",
    name: "Subnet",
    abbr: "SUB",
    category: "network",
    icon: SquareDashed,
    blurb: "Network segment inside a VPC, public or private.",
    zone: true,
    defaultSize: { width: 320, height: 280 },
    fields: [
      { key: "cidr", label: "CIDR block", type: "text", default: "10.0.1.0/24" },
      { key: "visibility", label: "Visibility", type: "select", options: ["public", "private"], default: "private" },
      { key: "az", label: "AZ suffix", type: "text", default: "a", hint: "Appended to the region, e.g. us-east-1a" },
    ],
  },
  {
    id: "alb",
    name: "Load Balancer",
    abbr: "ALB",
    category: "network",
    icon: Split,
    blurb: "Application load balancer for HTTP(S) traffic.",
    fields: [
      {
        key: "scheme",
        label: "Scheme",
        type: "select",
        options: ["internet-facing", "internal"],
        default: "internet-facing",
      },
      { key: "listener_port", label: "Listener port", type: "number", default: 443, min: 1, max: 65535 },
      { key: "protocol", label: "Protocol", type: "select", options: ["HTTPS", "HTTP"], default: "HTTPS" },
    ],
  },
  {
    id: "api-gateway",
    name: "API Gateway",
    abbr: "APG",
    category: "network",
    icon: Plug,
    blurb: "Managed API front door with routing and auth.",
    fields: [
      { key: "api_type", label: "API type", type: "select", options: ["HTTP", "REST", "WEBSOCKET"], default: "HTTP" },
      { key: "stage", label: "Stage name", type: "text", default: "prod" },
    ],
  },
  {
    id: "cloudfront",
    name: "CloudFront CDN",
    abbr: "CDN",
    category: "network",
    icon: Earth,
    blurb: "Global content delivery network and edge cache.",
    fields: [
      {
        key: "price_class",
        label: "Price class",
        type: "select",
        options: ["PriceClass_100", "PriceClass_200", "PriceClass_All"],
        default: "PriceClass_100",
      },
      { key: "default_ttl_s", label: "Default TTL (s)", type: "number", default: 3600, min: 0, max: 31536000 },
    ],
  },
  {
    id: "route53",
    name: "Route 53 DNS",
    abbr: "R53",
    category: "network",
    icon: Signpost,
    blurb: "DNS zone and records for your domain.",
    fields: [
      { key: "domain", label: "Domain name", type: "text", default: "example.com" },
      { key: "record", label: "Record type", type: "select", options: ["A-ALIAS", "CNAME"], default: "A-ALIAS" },
    ],
  },

  // ── Databases ──────────────────────────────────────────────────────────
  {
    id: "rds",
    name: "RDS Database",
    abbr: "RDS",
    category: "data",
    icon: Database,
    blurb: "Managed relational database (Postgres, MySQL…).",
    fields: [
      { key: "engine", label: "Engine", type: "select", options: ["postgres", "mysql", "mariadb"], default: "postgres" },
      {
        key: "instance_class",
        label: "Instance class",
        type: "select",
        options: ["db.t3.micro", "db.t3.medium", "db.r5.large"],
        default: "db.t3.micro",
      },
      { key: "storage_gb", label: "Storage (GB)", type: "number", default: 20, min: 20, max: 65536 },
      { key: "multi_az", label: "Multi-AZ", type: "boolean", default: false },
    ],
  },
  {
    id: "dynamodb",
    name: "DynamoDB Table",
    abbr: "DDB",
    category: "data",
    icon: Table2,
    blurb: "Serverless key-value store with single-digit-ms reads.",
    fields: [
      {
        key: "billing_mode",
        label: "Billing mode",
        type: "select",
        options: ["PAY_PER_REQUEST", "PROVISIONED"],
        default: "PAY_PER_REQUEST",
      },
      { key: "hash_key", label: "Partition key", type: "text", default: "id" },
    ],
  },
  {
    id: "elasticache",
    name: "ElastiCache",
    abbr: "ECH",
    category: "data",
    icon: MemoryStick,
    blurb: "In-memory cache cluster (Redis or Memcached).",
    fields: [
      { key: "engine", label: "Engine", type: "select", options: ["redis", "memcached"], default: "redis" },
      {
        key: "node_type",
        label: "Node type",
        type: "select",
        options: ["cache.t3.micro", "cache.t3.small", "cache.m5.large"],
        default: "cache.t3.micro",
      },
      { key: "num_nodes", label: "Nodes", type: "number", default: 1, min: 1, max: 20 },
    ],
  },

  // ── Storage ────────────────────────────────────────────────────────────
  {
    id: "s3",
    name: "S3 Bucket",
    abbr: "S3",
    category: "storage",
    icon: Archive,
    blurb: "Durable object storage for any kind of file.",
    fields: [
      { key: "versioning", label: "Versioning", type: "boolean", default: true },
      { key: "website", label: "Static website", type: "boolean", default: false },
      { key: "public_read", label: "Public read", type: "boolean", default: false },
    ],
  },
  {
    id: "efs",
    name: "EFS File System",
    abbr: "EFS",
    category: "storage",
    icon: FolderTree,
    blurb: "Shared POSIX file system for compute fleets.",
    fields: [
      {
        key: "performance_mode",
        label: "Performance mode",
        type: "select",
        options: ["generalPurpose", "maxIO"],
        default: "generalPurpose",
      },
      { key: "encrypted", label: "Encrypted", type: "boolean", default: true },
    ],
  },

  // ── Messaging & Events ─────────────────────────────────────────────────
  {
    id: "sqs",
    name: "SQS Queue",
    abbr: "SQS",
    category: "messaging",
    icon: Inbox,
    blurb: "Durable message queue for decoupling services.",
    fields: [
      { key: "fifo", label: "FIFO queue", type: "boolean", default: false },
      { key: "visibility_timeout_s", label: "Visibility timeout (s)", type: "number", default: 30, min: 0, max: 43200 },
    ],
  },
  {
    id: "sns",
    name: "SNS Topic",
    abbr: "SNS",
    category: "messaging",
    icon: Megaphone,
    blurb: "Pub/sub fan-out to queues, functions and email.",
    fields: [{ key: "fifo", label: "FIFO topic", type: "boolean", default: false }],
  },
  {
    id: "eventbridge",
    name: "EventBridge Bus",
    abbr: "EVB",
    category: "messaging",
    icon: Route,
    blurb: "Event bus with rule-based routing between services.",
    fields: [{ key: "bus_name", label: "Bus name", type: "text", default: "app-events" }],
  },

  // ── Security & Identity ────────────────────────────────────────────────
  {
    id: "cognito",
    name: "Cognito User Pool",
    abbr: "COG",
    category: "security",
    icon: UserCheck,
    blurb: "User sign-up, sign-in and JWT issuance.",
    fields: [
      { key: "mfa", label: "MFA", type: "select", options: ["OFF", "OPTIONAL", "REQUIRED"], default: "OPTIONAL" },
      { key: "password_min", label: "Min password length", type: "number", default: 12, min: 6, max: 99 },
    ],
  },
  {
    id: "waf",
    name: "WAF Web ACL",
    abbr: "WAF",
    category: "security",
    icon: ShieldAlert,
    blurb: "Web application firewall with managed rule sets.",
    fields: [
      { key: "scope", label: "Scope", type: "select", options: ["REGIONAL", "CLOUDFRONT"], default: "REGIONAL" },
      { key: "managed_common_rules", label: "AWS common rules", type: "boolean", default: true },
    ],
  },
  {
    id: "secrets-manager",
    name: "Secrets Manager",
    abbr: "SCM",
    category: "security",
    icon: KeyRound,
    blurb: "Encrypted storage and rotation for credentials.",
    fields: [
      { key: "rotation", label: "Automatic rotation", type: "boolean", default: false },
      { key: "rotation_days", label: "Rotation (days)", type: "number", default: 30, min: 1, max: 365 },
    ],
  },

  // ── Observability ──────────────────────────────────────────────────────
  {
    id: "cloudwatch",
    name: "CloudWatch",
    abbr: "CW",
    category: "observability",
    icon: Activity,
    blurb: "Logs, metrics, dashboards and alarms.",
    fields: [
      {
        key: "retention_days",
        label: "Log retention (days)",
        type: "select",
        options: ["7", "30", "90", "365"],
        default: "30",
      },
      { key: "alarms", label: "Default alarms", type: "boolean", default: true },
    ],
  },

  // ── External Actors ────────────────────────────────────────────────────
  {
    id: "users",
    name: "Users",
    abbr: "USR",
    category: "external",
    icon: Users,
    blurb: "External actors — browsers, apps, API clients.",
    fields: [
      {
        key: "channel",
        label: "Channel",
        type: "select",
        options: ["web", "mobile", "api clients", "iot"],
        default: "web",
      },
    ],
  },
];

export const SERVICE_MAP: Record<string, ServiceDef> = Object.fromEntries(
  SERVICES.map((s) => [s.id, s]),
);

export function defaultConfig(svc: ServiceDef): NodeConfig {
  return Object.fromEntries(svc.fields.map((f) => [f.key, f.default]));
}

export function categoryOf(serviceId: string) {
  const svc = SERVICE_MAP[serviceId];
  return svc ? CATEGORIES[svc.category] : { label: "Unknown", color: "#8CA3BC" };
}

/** Compact catalog summary injected into the AI system prompt. */
export function catalogForPrompt(): string {
  return CATEGORY_ORDER.map((cat) => {
    const rows = SERVICES.filter((s) => s.category === cat)
      .map((s) => {
        const fields = s.fields
          .map((f) => (f.options ? `${f.key}(${f.options.join("|")})` : `${f.key}:${f.type}`))
          .join(", ");
        return `  - ${s.id} "${s.name}"${s.zone ? " [ZONE]" : ""} — config: ${fields}`;
      })
      .join("\n");
    return `${CATEGORIES[cat].label}:\n${rows}`;
  }).join("\n");
}
