import { buildEdge, buildNode } from "./factory";
import type { DesignEdge, DesignNode } from "./types";

export type Template = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  nodes: DesignNode[];
  edges: DesignEdge[];
};

const n = buildNode;
const e = buildEdge;

export const TEMPLATES: Template[] = [
  {
    id: "three-tier",
    name: "Three-Tier Web App",
    tagline: "ALB · EC2 · RDS · CACHE",
    description:
      "Classic web stack inside a VPC: a public subnet with a load balancer fronting an EC2 fleet in a private subnet, backed by Postgres and Redis.",
    nodes: [
      n({ id: "tt-users", serviceId: "users", label: "Web Users", x: 40, y: 380 }),
      n({ id: "tt-dns", serviceId: "route53", label: "App DNS", x: 270, y: 380, config: { domain: "app.example.com" } }),
      n({ id: "tt-vpc", serviceId: "vpc", label: "App VPC", x: 520, y: 180, width: 780, height: 480 }),
      n({
        id: "tt-pub", serviceId: "subnet", label: "Public Subnet", x: 560, y: 240, width: 280, height: 360,
        config: { cidr: "10.0.1.0/24", visibility: "public", az: "a" },
      }),
      n({
        id: "tt-priv", serviceId: "subnet", label: "Private Subnet", x: 880, y: 240, width: 380, height: 360,
        config: { cidr: "10.0.2.0/24", visibility: "private", az: "a" },
      }),
      n({ id: "tt-alb", serviceId: "alb", label: "Web ALB", x: 600, y: 390 }),
      n({ id: "tt-web", serviceId: "ec2", label: "App Servers", x: 940, y: 280, config: { instance_type: "t3.medium", count: 2 } }),
      n({ id: "tt-db", serviceId: "rds", label: "Primary DB", x: 940, y: 400, config: { engine: "postgres", multi_az: true } }),
      n({ id: "tt-cache", serviceId: "elasticache", label: "Session Cache", x: 940, y: 505 }),
      n({ id: "tt-logs", serviceId: "cloudwatch", label: "Monitoring", x: 270, y: 560 }),
    ],
    edges: [
      e({ id: "tt-e1", source: "tt-users", target: "tt-dns", label: "dns lookup" }),
      e({ id: "tt-e2", source: "tt-dns", target: "tt-alb", label: "https 443" }),
      e({ id: "tt-e3", source: "tt-alb", target: "tt-web", label: "http 80" }),
      e({ id: "tt-e4", source: "tt-web", target: "tt-db", label: "sql" }),
      e({ id: "tt-e5", source: "tt-web", target: "tt-cache", label: "cache" }),
      e({ id: "tt-e6", source: "tt-web", target: "tt-logs", label: "logs" }),
    ],
  },
  {
    id: "serverless-api",
    name: "Serverless API",
    tagline: "APIGW · LAMBDA · DDB · SQS",
    description:
      "Pay-per-request API: API Gateway with Cognito auth in front of Lambda, DynamoDB for state, and an SQS-buffered worker for async jobs.",
    nodes: [
      n({ id: "sa-users", serviceId: "users", label: "API Clients", x: 40, y: 300, config: { channel: "api clients" } }),
      n({ id: "sa-auth", serviceId: "cognito", label: "User Pool", x: 300, y: 120 }),
      n({ id: "sa-api", serviceId: "api-gateway", label: "Public API", x: 300, y: 300 }),
      n({
        id: "sa-fn", serviceId: "lambda", label: "Api Handler", x: 580, y: 300,
        config: { runtime: "nodejs22.x", memory_mb: 512 },
      }),
      n({ id: "sa-table", serviceId: "dynamodb", label: "App Table", x: 860, y: 180 }),
      n({ id: "sa-queue", serviceId: "sqs", label: "Jobs Queue", x: 860, y: 420 }),
      n({
        id: "sa-worker", serviceId: "lambda", label: "Job Worker", x: 1120, y: 420,
        config: { runtime: "nodejs22.x", timeout_s: 120 },
      }),
      n({ id: "sa-results", serviceId: "s3", label: "Results Bucket", x: 1380, y: 420 }),
      n({ id: "sa-logs", serviceId: "cloudwatch", label: "Logs & Alarms", x: 580, y: 540 }),
    ],
    edges: [
      e({ id: "sa-e1", source: "sa-users", target: "sa-api", label: "https" }),
      e({ id: "sa-e2", source: "sa-auth", target: "sa-api", label: "jwt authorizer" }),
      e({ id: "sa-e3", source: "sa-api", target: "sa-fn", label: "any /api" }),
      e({ id: "sa-e4", source: "sa-fn", target: "sa-table", label: "read/write" }),
      e({ id: "sa-e5", source: "sa-fn", target: "sa-queue", label: "enqueue" }),
      e({ id: "sa-e6", source: "sa-queue", target: "sa-worker", label: "event source" }),
      e({ id: "sa-e7", source: "sa-worker", target: "sa-results", label: "store results" }),
      e({ id: "sa-e8", source: "sa-fn", target: "sa-logs", label: "logs" }),
    ],
  },
  {
    id: "event-pipeline",
    name: "Event-Driven Pipeline",
    tagline: "EVENTBRIDGE · SQS · LAMBDA",
    description:
      "Ingest events through an API, publish them onto an EventBridge bus, and route them by rule to a buffered processor and an alerting topic.",
    nodes: [
      n({ id: "ep-src", serviceId: "users", label: "Event Producers", x: 40, y: 260, config: { channel: "api clients" } }),
      n({ id: "ep-api", serviceId: "api-gateway", label: "Ingest API", x: 290, y: 260 }),
      n({ id: "ep-ingest", serviceId: "lambda", label: "Ingest Fn", x: 560, y: 260 }),
      n({ id: "ep-bus", serviceId: "eventbridge", label: "Domain Bus", x: 830, y: 260 }),
      n({ id: "ep-queue", serviceId: "sqs", label: "Orders Queue", x: 1100, y: 140 }),
      n({ id: "ep-alerts", serviceId: "sns", label: "Alerts Topic", x: 1100, y: 400 }),
      n({
        id: "ep-proc", serviceId: "lambda", label: "Order Processor", x: 1370, y: 140,
        config: { runtime: "python3.13", memory_mb: 512 },
      }),
      n({ id: "ep-table", serviceId: "dynamodb", label: "Orders Table", x: 1640, y: 140, config: { hash_key: "order_id" } }),
    ],
    edges: [
      e({ id: "ep-e1", source: "ep-src", target: "ep-api", label: "events in" }),
      e({ id: "ep-e2", source: "ep-api", target: "ep-ingest", label: "post /events" }),
      e({ id: "ep-e3", source: "ep-ingest", target: "ep-bus", label: "publish" }),
      e({ id: "ep-e4", source: "ep-bus", target: "ep-queue", label: "rule: orders" }),
      e({ id: "ep-e5", source: "ep-bus", target: "ep-alerts", label: "rule: alerts" }),
      e({ id: "ep-e6", source: "ep-queue", target: "ep-proc", label: "batch trigger" }),
      e({ id: "ep-e7", source: "ep-proc", target: "ep-table", label: "persist" }),
    ],
  },
  {
    id: "static-site",
    name: "Static Site + CDN",
    tagline: "S3 · CLOUDFRONT · WAF",
    description:
      "A globally cached static site: S3 website bucket behind CloudFront with a WAF web ACL, a custom domain, and access logging.",
    nodes: [
      n({ id: "ss-users", serviceId: "users", label: "Visitors", x: 60, y: 240 }),
      n({ id: "ss-dns", serviceId: "route53", label: "Site DNS", x: 320, y: 240, config: { domain: "www.example.com" } }),
      n({ id: "ss-cdn", serviceId: "cloudfront", label: "Site CDN", x: 580, y: 240 }),
      n({ id: "ss-bucket", serviceId: "s3", label: "Site Bucket", x: 840, y: 240, config: { website: true } }),
      n({ id: "ss-waf", serviceId: "waf", label: "Edge Firewall", x: 580, y: 60, config: { scope: "CLOUDFRONT" } }),
      n({ id: "ss-logs", serviceId: "cloudwatch", label: "Access Logs", x: 840, y: 420 }),
    ],
    edges: [
      e({ id: "ss-e1", source: "ss-users", target: "ss-dns", label: "dns" }),
      e({ id: "ss-e2", source: "ss-dns", target: "ss-cdn", label: "alias" }),
      e({ id: "ss-e3", source: "ss-cdn", target: "ss-bucket", label: "origin (oac)" }),
      e({ id: "ss-e4", source: "ss-waf", target: "ss-cdn", label: "web acl" }),
      e({ id: "ss-e5", source: "ss-cdn", target: "ss-logs", label: "logs" }),
    ],
  },
];
