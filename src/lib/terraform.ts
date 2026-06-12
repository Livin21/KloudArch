import { SERVICE_MAP } from "./catalog";
import type { ConfigValue, DesignEdge, DesignNode } from "./types";

export type GenInput = {
  projectName: string;
  region: string;
  nodes: DesignNode[];
  edges: DesignEdge[];
};

/* ── helpers ──────────────────────────────────────────────────────────── */

function sanitize(label: string): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_");
  if (!base) return "resource";
  return /^[0-9]/.test(base) ? `r_${base}` : base;
}

function cfg(node: DesignNode, key: string): ConfigValue {
  return node.data.config?.[key] ?? "";
}

function num(node: DesignNode, key: string, fallback: number): number {
  const v = Number(cfg(node, key));
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

function bool(node: DesignNode, key: string): boolean {
  return cfg(node, key) === true || cfg(node, key) === "true";
}

const NODE_W = 190;
const NODE_H = 84;

function centerOf(node: DesignNode): { x: number; y: number } {
  const svc = SERVICE_MAP[node.data.serviceId];
  const w = node.width ?? svc?.defaultSize?.width ?? NODE_W;
  const h = node.height ?? svc?.defaultSize?.height ?? NODE_H;
  return { x: node.position.x + w / 2, y: node.position.y + h / 2 };
}

function rectOf(zone: DesignNode): { x: number; y: number; w: number; h: number } {
  const svc = SERVICE_MAP[zone.data.serviceId];
  return {
    x: zone.position.x,
    y: zone.position.y,
    w: zone.width ?? svc?.defaultSize?.width ?? 480,
    h: zone.height ?? svc?.defaultSize?.height ?? 320,
  };
}

function contains(zone: DesignNode, node: DesignNode): boolean {
  if (zone.id === node.id) return false;
  const r = rectOf(zone);
  const c = centerOf(node);
  return c.x >= r.x && c.x <= r.x + r.w && c.y >= r.y && c.y <= r.y + r.h;
}

/* ── generation context ───────────────────────────────────────────────── */

type Ctx = {
  region: string;
  name: (id: string) => string;
  byId: (id: string) => DesignNode | undefined;
  /** Outgoing neighbours of a node, optionally filtered by service id. */
  out: (id: string, serviceId?: string) => DesignNode[];
  /** Incoming neighbours of a node, optionally filtered by service id. */
  inn: (id: string, serviceId?: string) => DesignNode[];
  /** Smallest zone of the given service containing this node, if any. */
  zone: (node: DesignNode, serviceId: "vpc" | "subnet") => DesignNode | undefined;
  /** Emit a shared block exactly once (IAM roles, data sources, …). */
  once: (key: string, block: string) => void;
  output: (name: string, value: string, description: string) => void;
};

type Emitter = (node: DesignNode, ctx: Ctx) => string;

/* ── per-service emitters ─────────────────────────────────────────────── */

const EMITTERS: Record<string, Emitter> = {
  vpc: (n, ctx) => `resource "aws_vpc" "${ctx.name(n.id)}" {
  cidr_block           = "${cfg(n, "cidr")}"
  enable_dns_support   = true
  enable_dns_hostnames = ${bool(n, "dns_hostnames")}

  tags = { Name = "${n.data.label}" }
}`,

  subnet: (n, ctx) => {
    const vpc = ctx.zone(n, "vpc");
    const isPublic = cfg(n, "visibility") === "public";
    return `resource "aws_subnet" "${ctx.name(n.id)}" {
${vpc ? `  vpc_id                  = aws_vpc.${ctx.name(vpc.id)}.id` : `  # TODO: place this subnet inside a VPC zone on the canvas
  vpc_id                  = null`}
  cidr_block              = "${cfg(n, "cidr")}"
  availability_zone       = "${ctx.region}${cfg(n, "az") || "a"}"
  map_public_ip_on_launch = ${isPublic}

  tags = { Name = "${n.data.label}", Tier = "${isPublic ? "public" : "private"}" }
}`;
  },

  ec2: (n, ctx) => {
    ctx.once(
      "ami_al2023",
      `data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }
}`,
    );
    const subnet = ctx.zone(n, "subnet");
    const count = num(n, "count", 1);
    return `resource "aws_instance" "${ctx.name(n.id)}" {
${count > 1 ? `  count         = ${count}\n` : ""}  ami           = data.aws_ami.al2023.id
  instance_type = "${cfg(n, "instance_type")}"
${subnet ? `  subnet_id     = aws_subnet.${ctx.name(subnet.id)}.id\n` : ""}
  tags = { Name = "${n.data.label}${count > 1 ? " ${count.index}" : ""}" }
}`;
  },

  lambda: (n, ctx) => {
    ctx.once(
      "lambda_role",
      `resource "aws_iam_role" "lambda_exec" {
  name = "\${var.project}-lambda-exec"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}`,
    );

    // Wire downstream data stores into the function environment.
    const env: string[] = [];
    ctx.out(n.id, "dynamodb").forEach((t, i) =>
      env.push(`      TABLE_NAME${i > 0 ? `_${i + 1}` : ""} = aws_dynamodb_table.${ctx.name(t.id)}.name`),
    );
    ctx.out(n.id, "s3").forEach((t, i) =>
      env.push(`      BUCKET_NAME${i > 0 ? `_${i + 1}` : ""} = aws_s3_bucket.${ctx.name(t.id)}.bucket`),
    );
    ctx.out(n.id, "sqs").forEach((t, i) =>
      env.push(`      QUEUE_URL${i > 0 ? `_${i + 1}` : ""} = aws_sqs_queue.${ctx.name(t.id)}.url`),
    );
    ctx.out(n.id, "sns").forEach((t, i) =>
      env.push(`      TOPIC_ARN${i > 0 ? `_${i + 1}` : ""} = aws_sns_topic.${ctx.name(t.id)}.arn`),
    );
    ctx.out(n.id, "eventbridge").forEach((t, i) =>
      env.push(`      EVENT_BUS${i > 0 ? `_${i + 1}` : ""} = aws_cloudwatch_event_bus.${ctx.name(t.id)}.name`),
    );

    const name = ctx.name(n.id);
    let block = `resource "aws_lambda_function" "${name}" {
  function_name = "\${var.project}-${name.replace(/_/g, "-")}"
  role          = aws_iam_role.lambda_exec.arn
  runtime       = "${cfg(n, "runtime")}"
  handler       = "${cfg(n, "handler")}"
  memory_size   = ${num(n, "memory_mb", 256)}
  timeout       = ${num(n, "timeout_s", 10)}

  # Package your code at this path before applying.
  filename         = "build/${name}.zip"
  source_code_hash = filebase64sha256("build/${name}.zip")
${env.length ? `\n  environment {\n    variables = {\n${env.join("\n")}\n    }\n  }\n` : ""}}`;

    // Queue → function event source mappings (edge: sqs → lambda).
    ctx.inn(n.id, "sqs").forEach((q) => {
      block += `\n\nresource "aws_lambda_event_source_mapping" "${ctx.name(q.id)}_to_${name}" {
  event_source_arn = aws_sqs_queue.${ctx.name(q.id)}.arn
  function_name    = aws_lambda_function.${name}.arn
  batch_size       = 10
}`;
    });

    if (env.length || ctx.inn(n.id, "sqs").length) {
      block += `\n\n# NOTE: grant ${name} least-privilege access to the connected resources above.`;
    }
    return block;
  },

  ecs: (n, ctx) => {
    ctx.once(
      "ecs_cluster",
      `resource "aws_ecs_cluster" "main" {
  name = "\${var.project}-cluster"
}`,
    );
    const name = ctx.name(n.id);
    const subnet = ctx.zone(n, "subnet");
    return `resource "aws_ecs_task_definition" "${name}" {
  family                   = "\${var.project}-${name.replace(/_/g, "-")}"
  requires_compatibilities = ["${cfg(n, "launch_type")}"]
  network_mode             = "awsvpc"
  cpu                      = ${cfg(n, "cpu")}
  memory                   = ${num(n, "memory_mb", 512)}

  container_definitions = jsonencode([{
    name      = "${name.replace(/_/g, "-")}"
    image     = "${cfg(n, "image")}"
    essential = true
    portMappings = [{ containerPort = 80 }]
  }])
}

resource "aws_ecs_service" "${name}" {
  name            = "\${var.project}-${name.replace(/_/g, "-")}"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.${name}.arn
  desired_count   = ${num(n, "desired_count", 2)}
  launch_type     = "${cfg(n, "launch_type")}"

  network_configuration {
${subnet ? `    subnets = [aws_subnet.${ctx.name(subnet.id)}.id]` : `    subnets = [] # TODO: place this service inside a subnet zone on the canvas`}
  }
}`;
  },

  alb: (n, ctx) => {
    const name = ctx.name(n.id);
    const subnet = ctx.zone(n, "subnet");
    const targets = [...ctx.out(n.id, "ec2"), ...ctx.out(n.id, "ecs")];
    let block = `resource "aws_lb" "${name}" {
  name               = "\${var.project}-${name.replace(/_/g, "-")}"
  load_balancer_type = "application"
  internal           = ${cfg(n, "scheme") === "internal"}
${subnet ? `  subnets            = [aws_subnet.${ctx.name(subnet.id)}.id] # add a second AZ subnet for production` : `  subnets            = [] # TODO: ALBs need at least two subnets in different AZs`}
}

resource "aws_lb_target_group" "${name}" {
  name        = "\${var.project}-${name.replace(/_/g, "-")}-tg"
  port        = 80
  protocol    = "HTTP"
  target_type = "${targets.some((t) => t.data.serviceId === "ecs") ? "ip" : "instance"}"
${(() => {
      const vpc = subnet ? ctx.zone(subnet, "vpc") : ctx.zone(n, "vpc");
      return vpc ? `  vpc_id      = aws_vpc.${ctx.name(vpc.id)}.id` : `  # vpc_id    = … (place the ALB inside a VPC zone)`;
    })()}
}

resource "aws_lb_listener" "${name}" {
  load_balancer_arn = aws_lb.${name}.arn
  port              = ${num(n, "listener_port", 443)}
  protocol          = "${cfg(n, "protocol")}"${
    cfg(n, "protocol") === "HTTPS" ? `\n  # certificate_arn = … (attach an ACM certificate)` : ""
  }

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.${name}.arn
  }
}`;
    targets
      .filter((t) => t.data.serviceId === "ec2")
      .forEach((t) => {
        const tn = ctx.name(t.id);
        const count = num(t, "count", 1);
        block += `\n\nresource "aws_lb_target_group_attachment" "${name}_${tn}" {
${count > 1 ? `  count            = ${count}\n` : ""}  target_group_arn = aws_lb_target_group.${name}.arn
  target_id        = aws_instance.${tn}${count > 1 ? "[count.index]" : ""}.id
  port             = 80
}`;
      });
    ctx.output(`${name}_dns`, `aws_lb.${name}.dns_name`, `Public DNS of ${n.data.label}`);
    return block;
  },

  "api-gateway": (n, ctx) => {
    const name = ctx.name(n.id);
    const apiType = cfg(n, "api_type");
    if (apiType !== "HTTP") {
      return `# ${n.data.label}: ${apiType} APIs are exported as HTTP API scaffolding for now.
resource "aws_apigatewayv2_api" "${name}" {
  name          = "\${var.project}-${name.replace(/_/g, "-")}"
  protocol_type = "${apiType === "WEBSOCKET" ? "WEBSOCKET" : "HTTP"}"${apiType === "WEBSOCKET" ? `\n  route_selection_expression = "$request.body.action"` : ""}
}`;
    }
    let block = `resource "aws_apigatewayv2_api" "${name}" {
  name          = "\${var.project}-${name.replace(/_/g, "-")}"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_stage" "${name}" {
  api_id      = aws_apigatewayv2_api.${name}.id
  name        = "${cfg(n, "stage")}"
  auto_deploy = true
}`;
    ctx.out(n.id, "lambda").forEach((fn) => {
      const fname = ctx.name(fn.id);
      block += `\n\nresource "aws_apigatewayv2_integration" "${name}_${fname}" {
  api_id                 = aws_apigatewayv2_api.${name}.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.${fname}.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "${name}_${fname}" {
  api_id    = aws_apigatewayv2_api.${name}.id
  route_key = "ANY /${fname.replace(/_/g, "-")}/{proxy+}"
  target    = "integrations/\${aws_apigatewayv2_integration.${name}_${fname}.id}"
}

resource "aws_lambda_permission" "${name}_${fname}" {
  statement_id  = "AllowAPIGw_${fname}"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.${fname}.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "\${aws_apigatewayv2_api.${name}.execution_arn}/*/*"
}`;
    });
    if (ctx.inn(n.id, "cognito").length > 0) {
      const pool = ctx.inn(n.id, "cognito")[0];
      block += `\n\nresource "aws_apigatewayv2_authorizer" "${name}_jwt" {
  api_id           = aws_apigatewayv2_api.${name}.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "cognito-jwt"

  jwt_configuration {
    audience = [aws_cognito_user_pool_client.${ctx.name(pool.id)}.id]
    issuer   = "https://\${aws_cognito_user_pool.${ctx.name(pool.id)}.endpoint}"
  }
}`;
    }
    ctx.output(`${name}_endpoint`, `aws_apigatewayv2_stage.${name}.invoke_url`, `Invoke URL of ${n.data.label}`);
    return block;
  },

  cloudfront: (n, ctx) => {
    const name = ctx.name(n.id);
    const s3Origins = ctx.out(n.id, "s3");
    const albOrigins = ctx.out(n.id, "alb");
    if (s3Origins.length > 0) {
      ctx.once(
        "oac",
        `resource "aws_cloudfront_origin_access_control" "main" {
  name                              = "\${var.project}-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}`,
      );
    }
    const origins: string[] = [];
    s3Origins.forEach((o) => {
      origins.push(`  origin {
    origin_id                = "s3-${ctx.name(o.id)}"
    domain_name              = aws_s3_bucket.${ctx.name(o.id)}.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.main.id
  }`);
    });
    albOrigins.forEach((o) => {
      origins.push(`  origin {
    origin_id   = "alb-${ctx.name(o.id)}"
    domain_name = aws_lb.${ctx.name(o.id)}.dns_name

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }`);
    });
    if (origins.length === 0) {
      origins.push(`  # TODO: connect this distribution to an S3 bucket or load balancer
  origin {
    origin_id   = "placeholder"
    domain_name = "example.com"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }`);
    }
    const defaultOriginId = s3Origins.length
      ? `s3-${ctx.name(s3Origins[0].id)}`
      : albOrigins.length
        ? `alb-${ctx.name(albOrigins[0].id)}`
        : "placeholder";
    const waf = ctx.inn(n.id, "waf").find((w) => cfg(w, "scope") === "CLOUDFRONT");
    ctx.output(`${name}_domain`, `aws_cloudfront_distribution.${name}.domain_name`, `CDN domain of ${n.data.label}`);
    return `resource "aws_cloudfront_distribution" "${name}" {
  enabled             = true
  comment             = "${n.data.label}"
  price_class         = "${cfg(n, "price_class")}"
  default_root_object = "index.html"
${waf ? `  web_acl_id          = aws_wafv2_web_acl.${ctx.name(waf.id)}.arn\n` : ""}
${origins.join("\n\n")}

  default_cache_behavior {
    target_origin_id       = "${defaultOriginId}"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    default_ttl            = ${num(n, "default_ttl_s", 3600)}

    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}`;
  },

  route53: (n, ctx) => {
    const name = ctx.name(n.id);
    let block = `resource "aws_route53_zone" "${name}" {
  name = "${cfg(n, "domain")}"
}`;
    ctx.out(n.id, "cloudfront").forEach((t) => {
      block += `\n\nresource "aws_route53_record" "${name}_${ctx.name(t.id)}" {
  zone_id = aws_route53_zone.${name}.zone_id
  name    = "${cfg(n, "domain")}"
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.${ctx.name(t.id)}.domain_name
    zone_id                = aws_cloudfront_distribution.${ctx.name(t.id)}.hosted_zone_id
    evaluate_target_health = false
  }
}`;
    });
    ctx.out(n.id, "alb").forEach((t) => {
      block += `\n\nresource "aws_route53_record" "${name}_${ctx.name(t.id)}" {
  zone_id = aws_route53_zone.${name}.zone_id
  name    = "${cfg(n, "domain")}"
  type    = "A"

  alias {
    name                   = aws_lb.${ctx.name(t.id)}.dns_name
    zone_id                = aws_lb.${ctx.name(t.id)}.zone_id
    evaluate_target_health = true
  }
}`;
    });
    return block;
  },

  rds: (n, ctx) => {
    ctx.once(
      "db_credentials",
      `variable "db_username" {
  type    = string
  default = "app"
}

variable "db_password" {
  type      = string
  sensitive = true
}`,
    );
    const engine = String(cfg(n, "engine"));
    const versionByEngine: Record<string, string> = { postgres: "16.4", mysql: "8.0", mariadb: "11.4" };
    return `resource "aws_db_instance" "${ctx.name(n.id)}" {
  identifier        = "\${var.project}-${ctx.name(n.id).replace(/_/g, "-")}"
  engine            = "${engine}"
  engine_version    = "${versionByEngine[engine] ?? "16.4"}"
  instance_class    = "${cfg(n, "instance_class")}"
  allocated_storage = ${num(n, "storage_gb", 20)}
  multi_az          = ${bool(n, "multi_az")}

  username = var.db_username
  password = var.db_password

  skip_final_snapshot = true # set false for production
}`;
  },

  dynamodb: (n, ctx) => `resource "aws_dynamodb_table" "${ctx.name(n.id)}" {
  name         = "\${var.project}-${ctx.name(n.id).replace(/_/g, "-")}"
  billing_mode = "${cfg(n, "billing_mode")}"
  hash_key     = "${cfg(n, "hash_key")}"
${cfg(n, "billing_mode") === "PROVISIONED" ? `  read_capacity  = 5\n  write_capacity = 5\n` : ""}
  attribute {
    name = "${cfg(n, "hash_key")}"
    type = "S"
  }
}`,

  elasticache: (n, ctx) => `resource "aws_elasticache_cluster" "${ctx.name(n.id)}" {
  cluster_id      = "\${var.project}-${ctx.name(n.id).replace(/_/g, "-")}"
  engine          = "${cfg(n, "engine")}"
  node_type       = "${cfg(n, "node_type")}"
  num_cache_nodes = ${num(n, "num_nodes", 1)}
${cfg(n, "engine") === "redis" ? `  port            = 6379` : `  port            = 11211`}
}`,

  s3: (n, ctx) => {
    const name = ctx.name(n.id);
    let block = `resource "aws_s3_bucket" "${name}" {
  bucket = "\${var.project}-${name.replace(/_/g, "-")}"
}`;
    if (bool(n, "versioning")) {
      block += `\n\nresource "aws_s3_bucket_versioning" "${name}" {
  bucket = aws_s3_bucket.${name}.id

  versioning_configuration {
    status = "Enabled"
  }
}`;
    }
    if (bool(n, "website")) {
      block += `\n\nresource "aws_s3_bucket_website_configuration" "${name}" {
  bucket = aws_s3_bucket.${name}.id

  index_document { suffix = "index.html" }
  error_document { key = "error.html" }
}`;
    }
    if (!bool(n, "public_read")) {
      block += `\n\nresource "aws_s3_bucket_public_access_block" "${name}" {
  bucket                  = aws_s3_bucket.${name}.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}`;
    }
    ctx.output(`${name}_bucket`, `aws_s3_bucket.${name}.bucket`, `Bucket name of ${n.data.label}`);
    return block;
  },

  efs: (n, ctx) => `resource "aws_efs_file_system" "${ctx.name(n.id)}" {
  performance_mode = "${cfg(n, "performance_mode")}"
  encrypted        = ${bool(n, "encrypted")}

  tags = { Name = "${n.data.label}" }
}`,

  sqs: (n, ctx) => {
    const fifo = bool(n, "fifo");
    return `resource "aws_sqs_queue" "${ctx.name(n.id)}" {
  name                       = "\${var.project}-${ctx.name(n.id).replace(/_/g, "-")}${fifo ? ".fifo" : ""}"
${fifo ? `  fifo_queue                 = true\n  content_based_deduplication = true\n` : ""}  visibility_timeout_seconds = ${num(n, "visibility_timeout_s", 30)}
}`;
  },

  sns: (n, ctx) => {
    const name = ctx.name(n.id);
    const fifo = bool(n, "fifo");
    let block = `resource "aws_sns_topic" "${name}" {
  name = "\${var.project}-${name.replace(/_/g, "-")}${fifo ? ".fifo" : ""}"${fifo ? `\n  fifo_topic = true` : ""}
}`;
    ctx.out(n.id, "sqs").forEach((q) => {
      block += `\n\nresource "aws_sns_topic_subscription" "${name}_${ctx.name(q.id)}" {
  topic_arn = aws_sns_topic.${name}.arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.${ctx.name(q.id)}.arn
}`;
    });
    ctx.out(n.id, "lambda").forEach((fn) => {
      block += `\n\nresource "aws_sns_topic_subscription" "${name}_${ctx.name(fn.id)}" {
  topic_arn = aws_sns_topic.${name}.arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.${ctx.name(fn.id)}.arn
}

resource "aws_lambda_permission" "${name}_${ctx.name(fn.id)}" {
  statement_id  = "AllowSNS_${ctx.name(fn.id)}"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.${ctx.name(fn.id)}.function_name
  principal     = "sns.amazonaws.com"
  source_arn    = aws_sns_topic.${name}.arn
}`;
    });
    return block;
  },

  eventbridge: (n, ctx) => {
    const name = ctx.name(n.id);
    let block = `resource "aws_cloudwatch_event_bus" "${name}" {
  name = "${cfg(n, "bus_name")}"
}`;
    [...ctx.out(n.id, "sqs"), ...ctx.out(n.id, "lambda"), ...ctx.out(n.id, "sns")].forEach((t) => {
      const tn = ctx.name(t.id);
      const svc = t.data.serviceId;
      const arn =
        svc === "sqs"
          ? `aws_sqs_queue.${tn}.arn`
          : svc === "sns"
            ? `aws_sns_topic.${tn}.arn`
            : `aws_lambda_function.${tn}.arn`;
      block += `\n\nresource "aws_cloudwatch_event_rule" "${name}_${tn}" {
  name           = "\${var.project}-to-${tn.replace(/_/g, "-")}"
  event_bus_name = aws_cloudwatch_event_bus.${name}.name

  # TODO: narrow this pattern to the events this target cares about.
  event_pattern = jsonencode({ source = [{ prefix = "" }] })
}

resource "aws_cloudwatch_event_target" "${name}_${tn}" {
  rule           = aws_cloudwatch_event_rule.${name}_${tn}.name
  event_bus_name = aws_cloudwatch_event_bus.${name}.name
  arn            = ${arn}
}`;
      if (svc === "lambda") {
        block += `\n\nresource "aws_lambda_permission" "${name}_${tn}" {
  statement_id  = "AllowEventBridge_${tn}"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.${tn}.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.${name}_${tn}.arn
}`;
      }
    });
    return block;
  },

  cognito: (n, ctx) => {
    const name = ctx.name(n.id);
    return `resource "aws_cognito_user_pool" "${name}" {
  name = "\${var.project}-${name.replace(/_/g, "-")}"

  mfa_configuration = "${cfg(n, "mfa") === "OFF" ? "OFF" : cfg(n, "mfa") === "REQUIRED" ? "ON" : "OPTIONAL"}"
${cfg(n, "mfa") !== "OFF" ? `\n  software_token_mfa_configuration {\n    enabled = true\n  }\n` : ""}
  password_policy {
    minimum_length    = ${num(n, "password_min", 12)}
    require_lowercase = true
    require_numbers   = true
    require_symbols   = true
    require_uppercase = true
  }
}

resource "aws_cognito_user_pool_client" "${name}" {
  name         = "\${var.project}-client"
  user_pool_id = aws_cognito_user_pool.${name}.id
}`;
  },

  waf: (n, ctx) => {
    const name = ctx.name(n.id);
    let block = `resource "aws_wafv2_web_acl" "${name}" {
  name  = "\${var.project}-${name.replace(/_/g, "-")}"
  scope = "${cfg(n, "scope")}"

  default_action {
    allow {}
  }
${
      bool(n, "managed_common_rules")
        ? `
  rule {
    name     = "aws-common"
    priority = 1

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "aws-common"
      sampled_requests_enabled   = true
    }
  }
`
        : ""
    }
  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${name}"
    sampled_requests_enabled   = true
  }
}`;
    if (cfg(n, "scope") === "REGIONAL") {
      ctx.out(n.id, "alb").forEach((t) => {
        block += `\n\nresource "aws_wafv2_web_acl_association" "${name}_${ctx.name(t.id)}" {
  resource_arn = aws_lb.${ctx.name(t.id)}.arn
  web_acl_arn  = aws_wafv2_web_acl.${name}.arn
}`;
      });
    }
    return block;
  },

  "secrets-manager": (n, ctx) => {
    const name = ctx.name(n.id);
    return `resource "aws_secretsmanager_secret" "${name}" {
  name = "\${var.project}/${name.replace(/_/g, "-")}"
}${
      bool(n, "rotation")
        ? `\n\n# NOTE: rotation every ${num(n, "rotation_days", 30)} days requires a rotation Lambda:
# resource "aws_secretsmanager_secret_rotation" "${name}" { … }`
        : ""
    }`;
  },

  cloudwatch: (n, ctx) => {
    const name = ctx.name(n.id);
    return `resource "aws_cloudwatch_log_group" "${name}" {
  name              = "/\${var.project}/${name.replace(/_/g, "-")}"
  retention_in_days = ${Number(cfg(n, "retention_days")) || 30}
}${
      bool(n, "alarms")
        ? `\n\n# NOTE: add aws_cloudwatch_metric_alarm resources for the services
# connected to "${n.data.label}" on the canvas.`
        : ""
    }`;
  },

  users: (n) => `# External actor "${n.data.label}" (${cfg(n, "channel")}) — nothing to provision.`,
};

/* ── assembly ─────────────────────────────────────────────────────────── */

const EMIT_ORDER = [
  "vpc",
  "subnet",
  "s3",
  "efs",
  "dynamodb",
  "rds",
  "elasticache",
  "sqs",
  "sns",
  "cognito",
  "secrets-manager",
  "cloudwatch",
  "ec2",
  "lambda",
  "ecs",
  "eventbridge",
  "alb",
  "waf",
  "api-gateway",
  "cloudfront",
  "route53",
  "users",
];

export function generateTerraform(input: GenInput): string {
  const { projectName, region, nodes, edges } = input;

  // Unique terraform-safe name per node.
  const names = new Map<string, string>();
  const used = new Set<string>();
  for (const node of nodes) {
    const base = sanitize(node.data.label);
    let candidate = base;
    let i = 2;
    while (used.has(candidate)) candidate = `${base}_${i++}`;
    used.add(candidate);
    names.set(node.id, candidate);
  }

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const zones = nodes.filter((node) => node.type === "zone");
  const onceBlocks = new Map<string, string>();
  const outputs: { name: string; value: string; description: string }[] = [];

  const ctx: Ctx = {
    region,
    name: (id) => names.get(id) ?? "unknown",
    byId: (id) => byId.get(id),
    out: (id, serviceId) =>
      edges
        .filter((edge) => edge.source === id)
        .map((edge) => byId.get(edge.target))
        .filter((node): node is DesignNode => !!node && (!serviceId || node.data.serviceId === serviceId)),
    inn: (id, serviceId) =>
      edges
        .filter((edge) => edge.target === id)
        .map((edge) => byId.get(edge.source))
        .filter((node): node is DesignNode => !!node && (!serviceId || node.data.serviceId === serviceId)),
    zone: (node, serviceId) => {
      const candidates = zones.filter((z) => z.data.serviceId === serviceId && contains(z, node));
      if (candidates.length === 0) return undefined;
      return candidates.sort((a, b) => {
        const ra = rectOf(a);
        const rb = rectOf(b);
        return ra.w * ra.h - rb.w * rb.h;
      })[0];
    },
    once: (key, block) => {
      if (!onceBlocks.has(key)) onceBlocks.set(key, block);
    },
    output: (name, value, description) => outputs.push({ name, value, description }),
  };

  const ordered = [...nodes].sort(
    (a, b) => EMIT_ORDER.indexOf(a.data.serviceId) - EMIT_ORDER.indexOf(b.data.serviceId),
  );

  const blocks: string[] = [];
  for (const node of ordered) {
    const emit = EMITTERS[node.data.serviceId];
    if (!emit) {
      blocks.push(`# ${node.data.label}: no Terraform mapping for "${node.data.serviceId}" yet.`);
      continue;
    }
    blocks.push(`# ── ${node.data.label} ${"─".repeat(Math.max(4, 56 - node.data.label.length))}\n${emit(node, ctx)}`);
  }

  const header = `# ╔══════════════════════════════════════════════════════════════════╗
# ║  ${projectName.toUpperCase().padEnd(64)}║
# ║  Generated by KloudArch Studio — review before applying.          ║
# ╚══════════════════════════════════════════════════════════════════╝

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

variable "project" {
  type    = string
  default = "${sanitize(projectName).replace(/_/g, "-")}"
}

variable "aws_region" {
  type    = string
  default = "${region}"
}

provider "aws" {
  region = var.aws_region
}`;

  const onceSection = onceBlocks.size
    ? `\n\n# ── shared ${"─".repeat(54)}\n${[...onceBlocks.values()].join("\n\n")}`
    : "";

  const outputSection = outputs.length
    ? `\n\n# ── outputs ${"─".repeat(53)}\n${outputs
        .map(
          (o) => `output "${o.name}" {
  description = "${o.description}"
  value       = ${o.value}
}`,
        )
        .join("\n\n")}`
    : "";

  const connectionDoc = edges.length
    ? `\n\n# ── design connections ${"─".repeat(42)}\n${edges
        .map((edge) => {
          const s = byId.get(edge.source);
          const t = byId.get(edge.target);
          if (!s || !t) return null;
          return `#   ${s.data.label} ──▶ ${t.data.label}${edge.label ? `   (${edge.label})` : ""}`;
        })
        .filter(Boolean)
        .join("\n")}`
    : "";

  if (nodes.length === 0) {
    return `${header}\n\n# The canvas is empty — drop services onto it and the plan appears here.\n`;
  }

  return `${header}${onceSection}\n\n${blocks.join("\n\n")}${outputSection}${connectionDoc}\n`;
}
