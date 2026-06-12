import { contains, type GenInput } from "./terraform";
import type { ConfigValue, DesignNode } from "./types";

/**
 * Design graph → CloudFormation template (JSON).
 *
 * Mirrors terraform.ts: an EMITTERS record per service id and a Ctx with
 * refs/once/outputs and geometric zone containment. CloudFormation is both
 * an exportable IaC format and the studio's deploy engine (AWS executes it
 * natively — no runner infrastructure).
 */

type Cfn = Record<string, unknown>;

/* ── helpers ──────────────────────────────────────────────────────────── */

function logicalize(label: string): string {
  const words = label.replace(/[^a-zA-Z0-9]+/g, " ").trim().split(/\s+/);
  const id = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
  if (!id) return "Resource";
  return /^[0-9]/.test(id) ? `R${id}` : id;
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

const ref = (id: string): Cfn => ({ Ref: id });
const att = (id: string, attr: string): Cfn => ({ "Fn::GetAtt": [id, attr] });
const sub = (tpl: string): Cfn => ({ "Fn::Sub": tpl });

/** Runtimes CloudFormation can deploy with inline ZipFile code. */
export function inlineRuntime(runtime: string): string | null {
  if (runtime.startsWith("nodejs") || runtime.startsWith("python")) return runtime;
  return null;
}

const NODE_PLACEHOLDER = `exports.handler = async () => ({
  statusCode: 200,
  body: JSON.stringify({ message: "KloudArch placeholder - replace me" }),
});`;

const PYTHON_PLACEHOLDER = `def handler(event, context):
    return {"statusCode": 200, "body": "KloudArch placeholder - replace me"}`;

/* ── generation context ───────────────────────────────────────────────── */

type Ctx = {
  region: string;
  lid: (nodeId: string) => string;
  byId: (nodeId: string) => DesignNode | undefined;
  out: (nodeId: string, serviceId?: string) => DesignNode[];
  inn: (nodeId: string, serviceId?: string) => DesignNode[];
  zone: (node: DesignNode, serviceId: "vpc" | "subnet") => DesignNode | undefined;
  /** Every node of a given service on the canvas. */
  nodesOf: (serviceId: string) => DesignNode[];
  /**
   * Subnets in this node's VPC, deduped by AZ (load balancers reject same-AZ
   * pairs). publicOnly filters to visibility=public.
   */
  vpcSubnets: (node: DesignNode, opts?: { publicOnly?: boolean }) => DesignNode[];
  res: (logicalId: string, resource: Cfn) => void;
  once: (logicalId: string, make: () => Cfn) => string;
  param: (name: string, def: Cfn) => string;
  output: (name: string, value: Cfn, description: string) => void;
  /** IAM statements accumulated for the shared Lambda execution role. */
  lambdaPolicy: (statement: Cfn) => void;
};

type Emitter = (node: DesignNode, ctx: Ctx) => void;

/* ── per-service emitters ─────────────────────────────────────────────── */

const EMITTERS: Record<string, Emitter> = {
  vpc: (n, ctx) => {
    ctx.res(ctx.lid(n.id), {
      Type: "AWS::EC2::VPC",
      Properties: {
        CidrBlock: String(cfg(n, "cidr")),
        EnableDnsSupport: true,
        EnableDnsHostnames: bool(n, "dns_hostnames"),
        Tags: [{ Key: "Name", Value: n.data.label }],
      },
    });
  },

  subnet: (n, ctx) => {
    const vpc = ctx.zone(n, "vpc");
    if (!vpc) return; // surfaced as a deploy warning — CFN subnets require a VPC
    const isPublic = cfg(n, "visibility") === "public";
    ctx.res(ctx.lid(n.id), {
      Type: "AWS::EC2::Subnet",
      Properties: {
        VpcId: ref(ctx.lid(vpc.id)),
        CidrBlock: String(cfg(n, "cidr")),
        AvailabilityZone: sub(`\${AWS::Region}${String(cfg(n, "az")) || "a"}`),
        MapPublicIpOnLaunch: isPublic,
        Tags: [
          { Key: "Name", Value: n.data.label },
          { Key: "Tier", Value: isPublic ? "public" : "private" },
        ],
      },
    });
  },

  "internet-gateway": (n, ctx) => {
    const vpc = ctx.zone(n, "vpc");
    if (!vpc) return; // surfaced as a deploy warning
    const lid = ctx.lid(n.id);
    const vlid = ctx.lid(vpc.id);
    ctx.res(lid, { Type: "AWS::EC2::InternetGateway", Properties: { Tags: [{ Key: "Name", Value: n.data.label }] } });
    ctx.res(`${lid}Attachment`, {
      Type: "AWS::EC2::VPCGatewayAttachment",
      Properties: { VpcId: ref(vlid), InternetGatewayId: ref(lid) },
    });
    // Derived glue: one public route table per VPC.
    ctx.once(`${vlid}PublicRouteTable`, () => ({
      Type: "AWS::EC2::RouteTable",
      Properties: { VpcId: ref(vlid), Tags: [{ Key: "Name", Value: `${vpc.data.label} public` }] },
    }));
    ctx.once(`${vlid}PublicRoute`, () => ({
      Type: "AWS::EC2::Route",
      DependsOn: [`${lid}Attachment`],
      Properties: {
        RouteTableId: ref(`${vlid}PublicRouteTable`),
        DestinationCidrBlock: "0.0.0.0/0",
        GatewayId: ref(lid),
      },
    }));
    ctx
      .nodesOf("subnet")
      .filter((s) => contains(vpc, s) && s.data.config?.visibility === "public")
      .forEach((s) => {
        ctx.once(`${ctx.lid(s.id)}PublicAssoc`, () => ({
          Type: "AWS::EC2::SubnetRouteTableAssociation",
          Properties: { SubnetId: ref(ctx.lid(s.id)), RouteTableId: ref(`${vlid}PublicRouteTable`) },
        }));
      });
  },

  "nat-gateway": (n, ctx) => {
    const subnet = ctx.zone(n, "subnet");
    const vpc = subnet ? ctx.zone(subnet, "vpc") : ctx.zone(n, "vpc");
    if (!subnet || !vpc) return; // surfaced as a deploy warning
    const lid = ctx.lid(n.id);
    const vlid = ctx.lid(vpc.id);
    const az = String(subnet.data.config?.az ?? "a");
    const azKey = az.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const igw = ctx.nodesOf("internet-gateway").find((g) => contains(vpc, g));

    ctx.res(`${lid}Eip`, {
      Type: "AWS::EC2::EIP",
      ...(igw ? { DependsOn: [`${ctx.lid(igw.id)}Attachment`] } : {}),
      Properties: { Domain: "vpc" },
    });
    ctx.res(lid, {
      Type: "AWS::EC2::NatGateway",
      Properties: {
        SubnetId: ref(ctx.lid(subnet.id)),
        AllocationId: att(`${lid}Eip`, "AllocationId"),
        Tags: [{ Key: "Name", Value: n.data.label }],
      },
    });

    // Private route table per (VPC, AZ-of-this-NAT); see terraform.ts twin
    // for the AZ-match + first-NAT-fallback association rule.
    const rtId = `${vlid}PrivateRouteTable${azKey}`;
    ctx.once(rtId, () => ({
      Type: "AWS::EC2::RouteTable",
      Properties: { VpcId: ref(vlid), Tags: [{ Key: "Name", Value: `${vpc.data.label} private ${az}` }] },
    }));
    ctx.once(`${rtId}Route`, () => ({
      Type: "AWS::EC2::Route",
      Properties: {
        RouteTableId: ref(rtId),
        DestinationCidrBlock: "0.0.0.0/0",
        NatGatewayId: ref(lid),
      },
    }));
    const natsInVpc = ctx.nodesOf("nat-gateway").filter((g) => contains(vpc, g));
    const natAz = (g: DesignNode) => {
      const gs = ctx.zone(g, "subnet");
      return String(gs?.data.config?.az ?? "a");
    };
    const isFirstNat = natsInVpc[0]?.id === n.id;
    ctx
      .nodesOf("subnet")
      .filter((s) => contains(vpc, s) && s.data.config?.visibility !== "public")
      .filter((s) => {
        const saz = String(s.data.config?.az ?? "a");
        if (saz === az) return true;
        return !natsInVpc.some((g) => natAz(g) === saz) && isFirstNat;
      })
      .forEach((s) => {
        ctx.once(`${ctx.lid(s.id)}PrivateAssoc`, () => ({
          Type: "AWS::EC2::SubnetRouteTableAssociation",
          Properties: { SubnetId: ref(ctx.lid(s.id)), RouteTableId: ref(rtId) },
        }));
      });
  },

  ec2: (n, ctx) => {
    const ami = ctx.param("Al2023AmiId", {
      Type: "AWS::SSM::Parameter::Value<AWS::EC2::Image::Id>",
      Default: "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64",
      Description: "Latest Amazon Linux 2023 AMI (resolved via public SSM parameter)",
    });
    const subnet = ctx.zone(n, "subnet");
    const count = Math.min(num(n, "count", 1), 20);
    const base = ctx.lid(n.id);
    const alb = ctx.inn(n.id, "alb")[0];
    const albHasVpc =
      alb &&
      (ctx.zone(alb, "vpc") ??
        (() => {
          const s = ctx.zone(alb, "subnet");
          return s ? ctx.zone(s, "vpc") : undefined;
        })());
    for (let i = 1; i <= count; i++) {
      ctx.res(count > 1 ? `${base}${i}` : base, {
        Type: "AWS::EC2::Instance",
        Properties: {
          ImageId: ref(ami),
          InstanceType: String(cfg(n, "instance_type")),
          ...(subnet ? { SubnetId: ref(ctx.lid(subnet.id)) } : {}),
          ...(albHasVpc ? { SecurityGroupIds: [ref(`${ctx.lid(alb.id)}TargetsSecurityGroup`)] } : {}),
          Tags: [{ Key: "Name", Value: count > 1 ? `${n.data.label} ${i}` : n.data.label }],
        },
      });
    }
  },

  lambda: (n, ctx) => {
    const role = ctx.once("LambdaExecRole", () => ({
      Type: "AWS::IAM::Role",
      Properties: {
        AssumeRolePolicyDocument: {
          Version: "2012-10-17",
          Statement: [
            { Effect: "Allow", Principal: { Service: "lambda.amazonaws.com" }, Action: "sts:AssumeRole" },
          ],
        },
        ManagedPolicyArns: ["arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"],
      },
    }));

    const requested = String(cfg(n, "runtime"));
    const runtime = inlineRuntime(requested) ?? "nodejs22.x"; // substitution is surfaced as a deploy warning
    const handlerFn = String(cfg(n, "handler")).split(".").pop() || "handler";
    const lid = ctx.lid(n.id);

    const env: Cfn = {};
    ctx.out(n.id, "dynamodb").forEach((t, i) => {
      env[`TABLE_NAME${i > 0 ? `_${i + 1}` : ""}`] = ref(ctx.lid(t.id));
      ctx.lambdaPolicy({
        Effect: "Allow",
        Action: ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:Scan"],
        Resource: att(ctx.lid(t.id), "Arn"),
      });
    });
    ctx.out(n.id, "s3").forEach((t, i) => {
      env[`BUCKET_NAME${i > 0 ? `_${i + 1}` : ""}`] = ref(ctx.lid(t.id));
      ctx.lambdaPolicy({
        Effect: "Allow",
        Action: ["s3:GetObject", "s3:PutObject", "s3:ListBucket"],
        Resource: [att(ctx.lid(t.id), "Arn"), sub(`\${${ctx.lid(t.id)}.Arn}/*`)],
      });
    });
    ctx.out(n.id, "sqs").forEach((t, i) => {
      env[`QUEUE_URL${i > 0 ? `_${i + 1}` : ""}`] = ref(ctx.lid(t.id));
      ctx.lambdaPolicy({
        Effect: "Allow",
        Action: ["sqs:SendMessage", "sqs:GetQueueAttributes"],
        Resource: att(ctx.lid(t.id), "Arn"),
      });
    });
    ctx.out(n.id, "sns").forEach((t, i) => {
      env[`TOPIC_ARN${i > 0 ? `_${i + 1}` : ""}`] = ref(ctx.lid(t.id));
      ctx.lambdaPolicy({ Effect: "Allow", Action: "sns:Publish", Resource: ref(ctx.lid(t.id)) });
    });
    ctx.out(n.id, "eventbridge").forEach((t, i) => {
      env[`EVENT_BUS${i > 0 ? `_${i + 1}` : ""}`] = att(ctx.lid(t.id), "Name");
      ctx.lambdaPolicy({ Effect: "Allow", Action: "events:PutEvents", Resource: att(ctx.lid(t.id), "Arn") });
    });
    ctx.out(n.id, "kinesis").forEach((t, i) => {
      env[`STREAM_NAME${i > 0 ? `_${i + 1}` : ""}`] = ref(ctx.lid(t.id));
      ctx.lambdaPolicy({
        Effect: "Allow",
        Action: ["kinesis:PutRecord", "kinesis:PutRecords"],
        Resource: att(ctx.lid(t.id), "Arn"),
      });
    });

    ctx.res(lid, {
      Type: "AWS::Lambda::Function",
      Properties: {
        Runtime: runtime,
        Handler: `index.${handlerFn}`,
        Role: att(role, "Arn"),
        MemorySize: num(n, "memory_mb", 256),
        Timeout: num(n, "timeout_s", 10),
        Code: { ZipFile: runtime.startsWith("python") ? PYTHON_PLACEHOLDER : NODE_PLACEHOLDER },
        ...(Object.keys(env).length ? { Environment: { Variables: env } } : {}),
        Tags: [{ Key: "Name", Value: n.data.label }],
      },
    });

    // Queue → function event source mappings (edge: sqs → lambda).
    ctx.inn(n.id, "sqs").forEach((q) => {
      ctx.lambdaPolicy({
        Effect: "Allow",
        Action: ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"],
        Resource: att(ctx.lid(q.id), "Arn"),
      });
      ctx.res(`${ctx.lid(q.id)}To${lid}`, {
        Type: "AWS::Lambda::EventSourceMapping",
        Properties: {
          EventSourceArn: att(ctx.lid(q.id), "Arn"),
          FunctionName: ref(lid),
          BatchSize: 10,
        },
      });
    });

    // Stream → function event source mappings (edge: kinesis → lambda).
    ctx.inn(n.id, "kinesis").forEach((k) => {
      ctx.lambdaPolicy({
        Effect: "Allow",
        Action: [
          "kinesis:DescribeStream",
          "kinesis:DescribeStreamSummary",
          "kinesis:GetRecords",
          "kinesis:GetShardIterator",
          "kinesis:ListShards",
          "kinesis:ListStreams",
        ],
        Resource: att(ctx.lid(k.id), "Arn"),
      });
      ctx.res(`${ctx.lid(k.id)}To${lid}`, {
        Type: "AWS::Lambda::EventSourceMapping",
        Properties: {
          EventSourceArn: att(ctx.lid(k.id), "Arn"),
          FunctionName: ref(lid),
          StartingPosition: "LATEST",
          BatchSize: 100,
        },
      });
    });
  },

  ecs: (n, ctx) => {
    const cluster = ctx.once("EcsCluster", () => ({ Type: "AWS::ECS::Cluster", Properties: {} }));
    const execRole = ctx.once("EcsExecutionRole", () => ({
      Type: "AWS::IAM::Role",
      Properties: {
        AssumeRolePolicyDocument: {
          Version: "2012-10-17",
          Statement: [
            { Effect: "Allow", Principal: { Service: "ecs-tasks.amazonaws.com" }, Action: "sts:AssumeRole" },
          ],
        },
        ManagedPolicyArns: ["arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"],
      },
    }));
    const lid = ctx.lid(n.id);
    const subnet = ctx.zone(n, "subnet");
    const isPublic = subnet ? cfg(subnet, "visibility") === "public" : false;

    ctx.res(`${lid}TaskDef`, {
      Type: "AWS::ECS::TaskDefinition",
      Properties: {
        RequiresCompatibilities: [String(cfg(n, "launch_type"))],
        NetworkMode: "awsvpc",
        Cpu: String(cfg(n, "cpu")),
        Memory: String(num(n, "memory_mb", 512)),
        ExecutionRoleArn: att(execRole, "Arn"),
        ContainerDefinitions: [
          {
            Name: lid.toLowerCase(),
            Image: String(cfg(n, "image")),
            Essential: true,
            PortMappings: [{ ContainerPort: 80 }],
          },
        ],
      },
    });

    const albs = ctx.inn(n.id, "alb");
    ctx.res(lid, {
      Type: "AWS::ECS::Service",
      Properties: {
        Cluster: ref(cluster),
        TaskDefinition: ref(`${lid}TaskDef`),
        DesiredCount: num(n, "desired_count", 2),
        LaunchType: String(cfg(n, "launch_type")),
        ...(subnet
          ? {
              NetworkConfiguration: {
                AwsvpcConfiguration: {
                  Subnets: [ref(ctx.lid(subnet.id))],
                  AssignPublicIp: isPublic ? "ENABLED" : "DISABLED",
                  ...(albs.length &&
                  (ctx.zone(albs[0], "vpc") ??
                    (() => {
                      const as = ctx.zone(albs[0], "subnet");
                      return as ? ctx.zone(as, "vpc") : undefined;
                    })())
                    ? { SecurityGroups: [ref(`${ctx.lid(albs[0].id)}TargetsSecurityGroup`)] }
                    : {}),
                },
              },
            }
          : {}),
        ...(albs.length
          ? {
              LoadBalancers: [
                {
                  TargetGroupArn: ref(`${ctx.lid(albs[0].id)}TargetGroup`),
                  ContainerName: lid.toLowerCase(),
                  ContainerPort: 80,
                },
              ],
            }
          : {}),
      },
      ...(albs.length ? { DependsOn: [`${ctx.lid(albs[0].id)}Listener`] } : {}),
    });
  },

  alb: (n, ctx) => {
    const lid = ctx.lid(n.id);
    const internal = cfg(n, "scheme") === "internal";
    const subnets = ctx.vpcSubnets(n, { publicOnly: !internal });
    const vpc =
      ctx.zone(n, "vpc") ??
      (() => {
        const s = ctx.zone(n, "subnet");
        return s ? ctx.zone(s, "vpc") : undefined;
      })();

    if (vpc) {
      ctx.res(`${lid}SecurityGroup`, {
        Type: "AWS::EC2::SecurityGroup",
        Properties: {
          GroupDescription: `Ingress for ${n.data.label}`,
          VpcId: ref(ctx.lid(vpc.id)),
          SecurityGroupIngress: [
            { IpProtocol: "tcp", FromPort: 80, ToPort: 80, CidrIp: "0.0.0.0/0" },
            { IpProtocol: "tcp", FromPort: 443, ToPort: 443, CidrIp: "0.0.0.0/0" },
          ],
        },
      });
      ctx.res(`${lid}TargetsSecurityGroup`, {
        Type: "AWS::EC2::SecurityGroup",
        Properties: {
          GroupDescription: `Targets reachable from ${n.data.label}`,
          VpcId: ref(ctx.lid(vpc.id)),
          SecurityGroupIngress: [
            {
              IpProtocol: "tcp",
              FromPort: 80,
              ToPort: 80,
              SourceSecurityGroupId: ref(`${lid}SecurityGroup`),
            },
          ],
        },
      });
    }

    ctx.res(lid, {
      Type: "AWS::ElasticLoadBalancingV2::LoadBalancer",
      Properties: {
        Type: "application",
        Scheme: String(cfg(n, "scheme")),
        Subnets: subnets.map((s) => ref(ctx.lid(s.id))),
        ...(vpc ? { SecurityGroups: [ref(`${lid}SecurityGroup`)] } : {}),
      },
      // Internet-facing ALBs need the IGW route in place before creation.
      ...(ctx.nodesOf("internet-gateway").some((g) => vpc && contains(vpc, g)) && !internal
        ? { DependsOn: [`${ctx.lid(vpc!.id)}PublicRoute`] }
        : {}),
    });

    const ec2Targets = ctx.out(n.id, "ec2");
    const ecsTargets = ctx.out(n.id, "ecs");
    const targets: Cfn[] = [];
    ec2Targets.forEach((t) => {
      const count = Math.min(num(t, "count", 1), 20);
      const base = ctx.lid(t.id);
      for (let i = 1; i <= count; i++) {
        targets.push({ Id: ref(count > 1 ? `${base}${i}` : base) });
      }
    });

    ctx.res(`${lid}TargetGroup`, {
      Type: "AWS::ElasticLoadBalancingV2::TargetGroup",
      Properties: {
        Port: 80,
        Protocol: "HTTP",
        TargetType: ecsTargets.length ? "ip" : "instance",
        ...(vpc ? { VpcId: ref(ctx.lid(vpc.id)) } : {}),
        ...(targets.length ? { Targets: targets } : {}),
      },
    });

    // Real HTTPS when a cert is connected; otherwise HTTP (surfaced as a
    // deploy warning when HTTPS was requested without a certificate).
    const cert = ctx.inn(n.id, "acm-cert")[0];
    const https = cfg(n, "protocol") === "HTTPS" && !!cert;
    ctx.res(`${lid}Listener`, {
      Type: "AWS::ElasticLoadBalancingV2::Listener",
      Properties: {
        LoadBalancerArn: ref(lid),
        ...(https
          ? {
              Port: 443,
              Protocol: "HTTPS",
              SslPolicy: "ELBSecurityPolicy-TLS13-1-2-2021-06",
              Certificates: [{ CertificateArn: ref(ctx.lid(cert.id)) }],
            }
          : {
              Port: cfg(n, "protocol") === "HTTPS" ? 80 : num(n, "listener_port", 80),
              Protocol: "HTTP",
            }),
        DefaultActions: [{ Type: "forward", TargetGroupArn: ref(`${lid}TargetGroup`) }],
      },
    });

    ctx.output(`${lid}Dns`, att(lid, "DNSName"), `Public DNS of ${n.data.label}`);
  },

  "api-gateway": (n, ctx) => {
    const lid = ctx.lid(n.id);
    ctx.res(lid, {
      Type: "AWS::ApiGatewayV2::Api",
      Properties: {
        Name: sub(`\${AWS::StackName}-${lid.toLowerCase()}`),
        ProtocolType: cfg(n, "api_type") === "WEBSOCKET" ? "WEBSOCKET" : "HTTP",
        ...(cfg(n, "api_type") === "WEBSOCKET"
          ? { RouteSelectionExpression: "$request.body.action" }
          : {}),
      },
    });
    ctx.res(`${lid}Stage`, {
      Type: "AWS::ApiGatewayV2::Stage",
      Properties: {
        ApiId: ref(lid),
        StageName: String(cfg(n, "stage")) || "prod",
        AutoDeploy: true,
      },
    });

    ctx.out(n.id, "lambda").forEach((fn) => {
      const flid = ctx.lid(fn.id);
      ctx.res(`${lid}${flid}Integration`, {
        Type: "AWS::ApiGatewayV2::Integration",
        Properties: {
          ApiId: ref(lid),
          IntegrationType: "AWS_PROXY",
          IntegrationUri: att(flid, "Arn"),
          PayloadFormatVersion: "2.0",
        },
      });
      ctx.res(`${lid}${flid}Route`, {
        Type: "AWS::ApiGatewayV2::Route",
        Properties: {
          ApiId: ref(lid),
          RouteKey: `ANY /${flid.toLowerCase()}/{proxy+}`,
          Target: sub(`integrations/\${${lid}${flid}Integration}`),
        },
      });
      ctx.res(`${lid}${flid}Permission`, {
        Type: "AWS::Lambda::Permission",
        Properties: {
          Action: "lambda:InvokeFunction",
          FunctionName: ref(flid),
          Principal: "apigateway.amazonaws.com",
          SourceArn: sub(`arn:aws:execute-api:\${AWS::Region}:\${AWS::AccountId}:\${${lid}}/*/*`),
        },
      });
    });

    const pool = ctx.inn(n.id, "cognito")[0];
    if (pool && cfg(n, "api_type") === "HTTP") {
      ctx.res(`${lid}JwtAuthorizer`, {
        Type: "AWS::ApiGatewayV2::Authorizer",
        Properties: {
          ApiId: ref(lid),
          AuthorizerType: "JWT",
          IdentitySource: ["$request.header.Authorization"],
          Name: "cognito-jwt",
          JwtConfiguration: {
            Audience: [ref(`${ctx.lid(pool.id)}Client`)],
            Issuer: sub(`https://cognito-idp.\${AWS::Region}.amazonaws.com/\${${ctx.lid(pool.id)}}`),
          },
        },
      });
    }

    ctx.output(`${lid}Endpoint`, att(lid, "ApiEndpoint"), `Invoke URL of ${n.data.label}`);
  },

  cloudfront: (n, ctx) => {
    const lid = ctx.lid(n.id);
    const s3Origins = ctx.out(n.id, "s3");
    const albOrigins = ctx.out(n.id, "alb");

    const oac = s3Origins.length
      ? ctx.once("CdnOriginAccessControl", () => ({
          Type: "AWS::CloudFront::OriginAccessControl",
          Properties: {
            OriginAccessControlConfig: {
              Name: sub("${AWS::StackName}-oac"),
              OriginAccessControlOriginType: "s3",
              SigningBehavior: "always",
              SigningProtocol: "sigv4",
            },
          },
        }))
      : null;

    const origins: Cfn[] = [];
    s3Origins.forEach((o) => {
      origins.push({
        Id: `s3-${ctx.lid(o.id)}`,
        DomainName: att(ctx.lid(o.id), "RegionalDomainName"),
        S3OriginConfig: { OriginAccessIdentity: "" },
        OriginAccessControlId: ref(oac!),
      });
    });
    albOrigins.forEach((o) => {
      origins.push({
        Id: `alb-${ctx.lid(o.id)}`,
        DomainName: att(ctx.lid(o.id), "DNSName"),
        CustomOriginConfig: {
          HTTPPort: 80,
          HTTPSPort: 443,
          OriginProtocolPolicy: "http-only",
          OriginSSLProtocols: ["TLSv1.2"],
        },
      });
    });
    if (origins.length === 0) return; // surfaced as a lint warning already (cdn-origin)

    const waf = ctx.inn(n.id, "waf").find(
      (w) => cfg(w, "scope") === "CLOUDFRONT" && ctx.region === "us-east-1",
    );
    // CloudFront only accepts certs issued in us-east-1; a single-region
    // stack elsewhere keeps the default cert (surfaced as a deploy warning).
    const cert = ctx.region === "us-east-1" ? ctx.inn(n.id, "acm-cert")[0] : undefined;

    ctx.res(lid, {
      Type: "AWS::CloudFront::Distribution",
      Properties: {
        DistributionConfig: {
          Enabled: true,
          Comment: n.data.label,
          PriceClass: String(cfg(n, "price_class")),
          DefaultRootObject: "index.html",
          Origins: origins,
          DefaultCacheBehavior: {
            TargetOriginId: String(origins[0].Id),
            ViewerProtocolPolicy: "redirect-to-https",
            AllowedMethods: ["GET", "HEAD", "OPTIONS"],
            CachedMethods: ["GET", "HEAD"],
            DefaultTTL: num(n, "default_ttl_s", 3600),
            ForwardedValues: { QueryString: false, Cookies: { Forward: "none" } },
          },
          Restrictions: { GeoRestriction: { RestrictionType: "none" } },
          ...(cert
            ? {
                Aliases: [String(cert.data.config?.domain ?? "")],
                ViewerCertificate: {
                  AcmCertificateArn: ref(ctx.lid(cert.id)),
                  SslSupportMethod: "sni-only",
                  MinimumProtocolVersion: "TLSv1.2_2021",
                },
              }
            : { ViewerCertificate: { CloudFrontDefaultCertificate: true } }),
          ...(waf ? { WebACLId: att(ctx.lid(waf.id), "Arn") } : {}),
        },
      },
    });

    // Allow this distribution to read each S3 origin (OAC pattern).
    s3Origins.forEach((o) => {
      ctx.res(`${ctx.lid(o.id)}OacPolicy`, {
        Type: "AWS::S3::BucketPolicy",
        Properties: {
          Bucket: ref(ctx.lid(o.id)),
          PolicyDocument: {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: { Service: "cloudfront.amazonaws.com" },
                Action: "s3:GetObject",
                Resource: sub(`\${${ctx.lid(o.id)}.Arn}/*`),
                Condition: {
                  StringEquals: {
                    "AWS:SourceArn": sub(
                      `arn:aws:cloudfront::\${AWS::AccountId}:distribution/\${${lid}}`,
                    ),
                  },
                },
              },
            ],
          },
        },
      });
    });

    ctx.output(`${lid}Domain`, att(lid, "DomainName"), `CDN domain of ${n.data.label}`);
  },

  route53: (n, ctx) => {
    const lid = ctx.lid(n.id);
    const domain = String(cfg(n, "domain"));
    ctx.res(lid, {
      Type: "AWS::Route53::HostedZone",
      Properties: { Name: domain },
    });
    ctx.out(n.id, "cloudfront").forEach((t) => {
      ctx.res(`${lid}${ctx.lid(t.id)}Record`, {
        Type: "AWS::Route53::RecordSet",
        Properties: {
          HostedZoneId: ref(lid),
          Name: domain,
          Type: "A",
          AliasTarget: {
            DNSName: att(ctx.lid(t.id), "DomainName"),
            HostedZoneId: "Z2FDTNDATAQYW2", // CloudFront's fixed zone id
          },
        },
      });
    });
    ctx.out(n.id, "alb").forEach((t) => {
      ctx.res(`${lid}${ctx.lid(t.id)}Record`, {
        Type: "AWS::Route53::RecordSet",
        Properties: {
          HostedZoneId: ref(lid),
          Name: domain,
          Type: "A",
          AliasTarget: {
            DNSName: att(ctx.lid(t.id), "DNSName"),
            HostedZoneId: att(ctx.lid(t.id), "CanonicalHostedZoneID"),
          },
        },
      });
    });
  },

  rds: (n, ctx) => {
    const lid = ctx.lid(n.id);
    ctx.res(lid, {
      Type: "AWS::RDS::DBInstance",
      DeletionPolicy: "Delete",
      UpdateReplacePolicy: "Delete",
      Properties: {
        Engine: String(cfg(n, "engine")),
        DBInstanceClass: String(cfg(n, "instance_class")),
        AllocatedStorage: String(num(n, "storage_gb", 20)),
        MultiAZ: bool(n, "multi_az"),
        MasterUsername: "app",
        ManageMasterUserPassword: true, // password lives in Secrets Manager, never in the template
        DeletionProtection: false,
      },
    });
    ctx.output(`${lid}Endpoint`, att(lid, "Endpoint.Address"), `Endpoint of ${n.data.label}`);
  },

  dynamodb: (n, ctx) => {
    const hashKey = String(cfg(n, "hash_key")) || "id";
    ctx.res(ctx.lid(n.id), {
      Type: "AWS::DynamoDB::Table",
      Properties: {
        BillingMode: String(cfg(n, "billing_mode")),
        AttributeDefinitions: [{ AttributeName: hashKey, AttributeType: "S" }],
        KeySchema: [{ AttributeName: hashKey, KeyType: "HASH" }],
        ...(cfg(n, "billing_mode") === "PROVISIONED"
          ? { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } }
          : {}),
      },
    });
  },

  elasticache: (n, ctx) => {
    ctx.res(ctx.lid(n.id), {
      Type: "AWS::ElastiCache::CacheCluster",
      Properties: {
        Engine: String(cfg(n, "engine")),
        CacheNodeType: String(cfg(n, "node_type")),
        NumCacheNodes: num(n, "num_nodes", 1),
        Port: cfg(n, "engine") === "redis" ? 6379 : 11211,
      },
    });
  },

  s3: (n, ctx) => {
    const lid = ctx.lid(n.id);
    ctx.res(lid, {
      Type: "AWS::S3::Bucket",
      Properties: {
        // No BucketName — CloudFormation auto-names, avoiding global collisions.
        ...(bool(n, "versioning") ? { VersioningConfiguration: { Status: "Enabled" } } : {}),
        ...(bool(n, "website")
          ? {
              WebsiteConfiguration: {
                IndexDocument: "index.html",
                ErrorDocument: "error.html",
              },
            }
          : {}),
        ...(bool(n, "public_read")
          ? {}
          : {
              PublicAccessBlockConfiguration: {
                BlockPublicAcls: true,
                BlockPublicPolicy: true,
                IgnorePublicAcls: true,
                RestrictPublicBuckets: true,
              },
            }),
        Tags: [{ Key: "Name", Value: n.data.label }],
      },
    });
    ctx.output(`${lid}Bucket`, ref(lid), `Bucket name of ${n.data.label}`);
  },

  efs: (n, ctx) => {
    ctx.res(ctx.lid(n.id), {
      Type: "AWS::EFS::FileSystem",
      Properties: {
        PerformanceMode: String(cfg(n, "performance_mode")),
        Encrypted: bool(n, "encrypted"),
        FileSystemTags: [{ Key: "Name", Value: n.data.label }],
      },
    });
  },

  sqs: (n, ctx) => {
    const fifo = bool(n, "fifo");
    ctx.res(ctx.lid(n.id), {
      Type: "AWS::SQS::Queue",
      Properties: {
        ...(fifo ? { FifoQueue: true, ContentBasedDeduplication: true } : {}),
        VisibilityTimeout: num(n, "visibility_timeout_s", 30),
      },
    });
  },

  sns: (n, ctx) => {
    const lid = ctx.lid(n.id);
    ctx.res(lid, {
      Type: "AWS::SNS::Topic",
      Properties: { ...(bool(n, "fifo") ? { FifoTopic: true } : {}) },
    });
    ctx.out(n.id, "sqs").forEach((q) => {
      const qlid = ctx.lid(q.id);
      ctx.res(`${lid}${qlid}Sub`, {
        Type: "AWS::SNS::Subscription",
        Properties: { Protocol: "sqs", TopicArn: ref(lid), Endpoint: att(qlid, "Arn") },
      });
      ctx.res(`${lid}${qlid}QueuePolicy`, {
        Type: "AWS::SQS::QueuePolicy",
        Properties: {
          Queues: [ref(qlid)],
          PolicyDocument: {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: { Service: "sns.amazonaws.com" },
                Action: "sqs:SendMessage",
                Resource: att(qlid, "Arn"),
                Condition: { ArnEquals: { "aws:SourceArn": ref(lid) } },
              },
            ],
          },
        },
      });
    });
    ctx.out(n.id, "lambda").forEach((fn) => {
      const flid = ctx.lid(fn.id);
      ctx.res(`${lid}${flid}Sub`, {
        Type: "AWS::SNS::Subscription",
        Properties: { Protocol: "lambda", TopicArn: ref(lid), Endpoint: att(flid, "Arn") },
      });
      ctx.res(`${lid}${flid}Permission`, {
        Type: "AWS::Lambda::Permission",
        Properties: {
          Action: "lambda:InvokeFunction",
          FunctionName: ref(flid),
          Principal: "sns.amazonaws.com",
          SourceArn: ref(lid),
        },
      });
    });
  },

  eventbridge: (n, ctx) => {
    const lid = ctx.lid(n.id);
    ctx.res(lid, {
      Type: "AWS::Events::EventBus",
      Properties: { Name: sub(`\${AWS::StackName}-${String(cfg(n, "bus_name")) || "bus"}`) },
    });
    [...ctx.out(n.id, "sqs"), ...ctx.out(n.id, "lambda"), ...ctx.out(n.id, "sns")].forEach((t) => {
      const tlid = ctx.lid(t.id);
      const svcId = t.data.serviceId;
      const targetArn = svcId === "sns" ? ref(tlid) : att(tlid, "Arn");
      ctx.res(`${lid}${tlid}Rule`, {
        Type: "AWS::Events::Rule",
        Properties: {
          EventBusName: ref(lid),
          // Match-everything pattern — narrow to the events this target cares about.
          EventPattern: { source: [{ prefix: "" }] },
          Targets: [{ Arn: targetArn, Id: `target-${tlid.toLowerCase()}` }],
        },
      });
      if (svcId === "lambda") {
        ctx.res(`${lid}${tlid}Permission`, {
          Type: "AWS::Lambda::Permission",
          Properties: {
            Action: "lambda:InvokeFunction",
            FunctionName: ref(tlid),
            Principal: "events.amazonaws.com",
            SourceArn: att(`${lid}${tlid}Rule`, "Arn"),
          },
        });
      }
      if (svcId === "sqs") {
        ctx.res(`${lid}${tlid}QueuePolicy`, {
          Type: "AWS::SQS::QueuePolicy",
          Properties: {
            Queues: [ref(tlid)],
            PolicyDocument: {
              Version: "2012-10-17",
              Statement: [
                {
                  Effect: "Allow",
                  Principal: { Service: "events.amazonaws.com" },
                  Action: "sqs:SendMessage",
                  Resource: att(tlid, "Arn"),
                  Condition: { ArnEquals: { "aws:SourceArn": att(`${lid}${tlid}Rule`, "Arn") } },
                },
              ],
            },
          },
        });
      }
    });

    // State machine targets need a RoleArn — resource policies don't apply to SFN.
    ctx.out(n.id, "step-functions").forEach((t) => {
      const tlid = ctx.lid(t.id);
      const role = ctx.once("EventsToSfnRole", () => ({
        Type: "AWS::IAM::Role",
        Properties: {
          AssumeRolePolicyDocument: {
            Version: "2012-10-17",
            Statement: [
              { Effect: "Allow", Principal: { Service: "events.amazonaws.com" }, Action: "sts:AssumeRole" },
            ],
          },
          Policies: [
            {
              PolicyName: "start-execution",
              PolicyDocument: {
                Version: "2012-10-17",
                // Scope Resource down to specific state machines for production.
                Statement: [{ Effect: "Allow", Action: "states:StartExecution", Resource: "*" }],
              },
            },
          ],
        },
      }));
      ctx.res(`${lid}${tlid}Rule`, {
        Type: "AWS::Events::Rule",
        Properties: {
          EventBusName: ref(lid),
          EventPattern: { source: [{ prefix: "" }] },
          Targets: [{ Arn: ref(tlid), Id: `target-${tlid.toLowerCase()}`, RoleArn: att(role, "Arn") }],
        },
      });
    });
  },

  cognito: (n, ctx) => {
    const lid = ctx.lid(n.id);
    const mfa = String(cfg(n, "mfa"));
    ctx.res(lid, {
      Type: "AWS::Cognito::UserPool",
      Properties: {
        MfaConfiguration: mfa === "REQUIRED" ? "ON" : mfa === "OFF" ? "OFF" : "OPTIONAL",
        ...(mfa !== "OFF" ? { EnabledMfas: ["SOFTWARE_TOKEN_MFA"] } : {}),
        Policies: {
          PasswordPolicy: {
            MinimumLength: num(n, "password_min", 12),
            RequireLowercase: true,
            RequireNumbers: true,
            RequireSymbols: true,
            RequireUppercase: true,
          },
        },
      },
    });
    ctx.res(`${lid}Client`, {
      Type: "AWS::Cognito::UserPoolClient",
      Properties: { UserPoolId: ref(lid) },
    });
  },

  waf: (n, ctx) => {
    const scope = String(cfg(n, "scope"));
    // CLOUDFRONT-scoped ACLs must live in us-east-1 — skipped elsewhere (deploy warning).
    if (scope === "CLOUDFRONT" && ctx.region !== "us-east-1") return;
    const lid = ctx.lid(n.id);
    ctx.res(lid, {
      Type: "AWS::WAFv2::WebACL",
      Properties: {
        Scope: scope,
        DefaultAction: { Allow: {} },
        VisibilityConfig: {
          CloudWatchMetricsEnabled: true,
          MetricName: lid.toLowerCase(),
          SampledRequestsEnabled: true,
        },
        ...(bool(n, "managed_common_rules")
          ? {
              Rules: [
                {
                  Name: "aws-common",
                  Priority: 1,
                  OverrideAction: { None: {} },
                  Statement: {
                    ManagedRuleGroupStatement: {
                      Name: "AWSManagedRulesCommonRuleSet",
                      VendorName: "AWS",
                    },
                  },
                  VisibilityConfig: {
                    CloudWatchMetricsEnabled: true,
                    MetricName: "aws-common",
                    SampledRequestsEnabled: true,
                  },
                },
              ],
            }
          : {}),
      },
    });
    if (scope === "REGIONAL") {
      ctx.out(n.id, "alb").forEach((t) => {
        ctx.res(`${lid}${ctx.lid(t.id)}Assoc`, {
          Type: "AWS::WAFv2::WebACLAssociation",
          Properties: { ResourceArn: ref(ctx.lid(t.id)), WebACLArn: att(lid, "Arn") },
        });
      });
    }
  },

  "acm-cert": (n, ctx) => {
    const lid = ctx.lid(n.id);
    const domain = String(cfg(n, "domain"));
    // Auto-wire DNS validation only on an exact zone match — a parent-zone
    // mismatch never validates and would hang the stack.
    const zone = ctx
      .nodesOf("route53")
      .find((z) => String(z.data.config?.domain ?? "") === domain);
    ctx.res(lid, {
      Type: "AWS::CertificateManager::Certificate",
      Properties: {
        DomainName: domain,
        ValidationMethod: "DNS",
        ...(zone
          ? {
              DomainValidationOptions: [
                { DomainName: domain, HostedZoneId: ref(ctx.lid(zone.id)) },
              ],
            }
          : {}),
      },
    });
  },

  "step-functions": (n, ctx) => {
    const lid = ctx.lid(n.id);
    const lambdas = ctx.out(n.id, "lambda").sort((a, b) => a.position.x - b.position.x);

    const states: Cfn = {};
    if (lambdas.length) {
      lambdas.forEach((fn, i) => {
        states[`Step${i + 1}`] = {
          Type: "Task",
          Resource: att(ctx.lid(fn.id), "Arn"),
          ...(i < lambdas.length - 1 ? { Next: `Step${i + 2}` } : { End: true }),
        };
      });
    } else {
      states.Placeholder = {
        Type: "Pass",
        Result: "Connect Lambdas to this state machine on the canvas.",
        End: true,
      };
    }

    ctx.res(`${lid}Role`, {
      Type: "AWS::IAM::Role",
      Properties: {
        AssumeRolePolicyDocument: {
          Version: "2012-10-17",
          Statement: [
            { Effect: "Allow", Principal: { Service: "states.amazonaws.com" }, Action: "sts:AssumeRole" },
          ],
        },
        ...(lambdas.length
          ? {
              Policies: [
                {
                  PolicyName: "invoke-tasks",
                  PolicyDocument: {
                    Version: "2012-10-17",
                    Statement: [
                      {
                        Effect: "Allow",
                        Action: "lambda:InvokeFunction",
                        Resource: lambdas.map((fn) => att(ctx.lid(fn.id), "Arn")),
                      },
                    ],
                  },
                },
              ],
            }
          : {}),
      },
    });

    ctx.res(lid, {
      Type: "AWS::StepFunctions::StateMachine",
      Properties: {
        StateMachineType: String(cfg(n, "type")) || "STANDARD",
        RoleArn: att(`${lid}Role`, "Arn"),
        Definition: {
          Comment: `${n.data.label} — generated by KloudArch; tasks run left-to-right from the canvas.`,
          StartAt: lambdas.length ? "Step1" : "Placeholder",
          States: states,
        },
      },
    });
  },

  kinesis: (n, ctx) => {
    const mode = String(cfg(n, "mode")) || "ON_DEMAND";
    ctx.res(ctx.lid(n.id), {
      Type: "AWS::Kinesis::Stream",
      Properties: {
        RetentionPeriodHours: num(n, "retention_hours", 24),
        StreamModeDetails: { StreamMode: mode },
        ...(mode === "PROVISIONED" ? { ShardCount: num(n, "shards", 1) } : {}),
      },
    });
  },

  "secrets-manager": (n, ctx) => {
    ctx.res(ctx.lid(n.id), {
      Type: "AWS::SecretsManager::Secret",
      Properties: {
        Description: `${n.data.label} — created by KloudArch`,
        GenerateSecretString: {},
      },
    });
  },

  cloudwatch: (n, ctx) => {
    const lid = ctx.lid(n.id);
    ctx.res(lid, {
      Type: "AWS::Logs::LogGroup",
      Properties: {
        LogGroupName: sub(`/\${AWS::StackName}/${lid.toLowerCase()}`),
        RetentionInDays: Number(cfg(n, "retention_days")) || 30,
      },
    });
  },

  users: () => {
    // External actor — nothing to provision.
  },
};

/* ── deploy-time warnings (CFN-specific, beyond the design lints) ─────── */

export function cfnDeployWarnings(input: GenInput): string[] {
  const warnings: string[] = [];
  const byId = new Map(input.nodes.map((n) => [n.id, n]));
  const inn = (id: string, serviceId: string) =>
    input.edges
      .filter((e) => e.target === id)
      .map((e) => byId.get(e.source))
      .filter((n): n is DesignNode => !!n && n.data.serviceId === serviceId);
  const out = (id: string, serviceId: string) =>
    input.edges
      .filter((e) => e.source === id)
      .map((e) => byId.get(e.target))
      .filter((n): n is DesignNode => !!n && n.data.serviceId === serviceId);
  const vpcs = input.nodes.filter((z) => z.data.serviceId === "vpc");
  const subnets = input.nodes.filter((z) => z.data.serviceId === "subnet");

  for (const n of input.nodes) {
    const s = n.data.serviceId;
    if (s === "lambda") {
      const runtime = String(n.data.config?.runtime ?? "");
      if (!inlineRuntime(runtime)) {
        warnings.push(
          `“${n.data.label}”: ${runtime} can't deploy with inline placeholder code — it will be created as nodejs22.x. Upload real code, then switch the runtime.`,
        );
      } else {
        warnings.push(
          `“${n.data.label}” deploys with placeholder code that returns a stub response — replace it after deploy.`,
        );
      }
    }
    if (s === "alb" && n.data.config?.protocol === "HTTPS" && inn(n.id, "acm-cert").length === 0) {
      warnings.push(
        `“${n.data.label}”: HTTPS needs a certificate — connect an ACM Certificate, or this deploys an HTTP listener on port 80.`,
      );
    }
    if (s === "waf" && n.data.config?.scope === "CLOUDFRONT" && input.region !== "us-east-1") {
      warnings.push(
        `“${n.data.label}”: CloudFront-scoped WAF must deploy in us-east-1 — it is omitted from this ${input.region} stack.`,
      );
    }
    if (s === "subnet" && !vpcs.some((z) => contains(z, n))) {
      warnings.push(`“${n.data.label}” has no containing VPC — it is omitted from the stack.`);
    }
    if (s === "internet-gateway" && !vpcs.some((z) => contains(z, n))) {
      warnings.push(`“${n.data.label}” isn't inside a VPC zone — it is omitted from the stack.`);
    }
    if (s === "nat-gateway") {
      if (!subnets.some((z) => contains(z, n))) {
        warnings.push(`“${n.data.label}” isn't inside a subnet — it is omitted from the stack.`);
      } else {
        warnings.push(
          `“${n.data.label}”: NAT gateways take 1–5 minutes to create and delete — stack events will sit on it.`,
        );
      }
    }
    if (s === "acm-cert") {
      const domain = String(n.data.config?.domain ?? "");
      const zone = input.nodes.find(
        (z) => z.data.serviceId === "route53" && String(z.data.config?.domain ?? "") === domain,
      );
      if (zone) {
        warnings.push(
          `“${n.data.label}”: validation rides on the “${zone.data.label}” zone created in this stack — it only succeeds if ${domain} is ALREADY delegated to that zone's name servers at your registrar. Otherwise the stack hangs for hours and rolls back.`,
        );
      } else {
        warnings.push(
          `“${n.data.label}”: no matching hosted zone in the design — create the DNS validation records manually in your DNS provider, or the stack waits on the certificate.`,
        );
      }
      if (out(n.id, "cloudfront").length > 0 && input.region !== "us-east-1") {
        warnings.push(
          `“${n.data.label}”: CloudFront only accepts us-east-1 certificates — the CDN keeps its default certificate in this ${input.region} stack. (The Terraform export handles this with a us-east-1 provider alias.)`,
        );
      }
    }
  }
  return warnings;
}

/* ── assembly ─────────────────────────────────────────────────────────── */

const EMIT_ORDER = [
  "vpc",
  "subnet",
  "internet-gateway",
  "nat-gateway",
  "s3",
  "efs",
  "dynamodb",
  "rds",
  "elasticache",
  "sqs",
  "kinesis",
  "cognito",
  "acm-cert",
  "secrets-manager",
  "cloudwatch",
  "ec2",
  "lambda",
  "step-functions",
  "alb",
  "ecs",
  "sns",
  "eventbridge",
  "waf",
  "api-gateway",
  "cloudfront",
  "route53",
  "users",
];

export function buildCloudFormationTemplate(input: GenInput): Cfn {
  const { projectName, region, nodes, edges } = input;

  // Unique logical id per node.
  const lids = new Map<string, string>();
  const used = new Set<string>();
  for (const node of nodes) {
    const base = logicalize(node.data.label);
    let candidate = base;
    let i = 2;
    while (used.has(candidate)) candidate = `${base}${i++}`;
    used.add(candidate);
    lids.set(node.id, candidate);
  }

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const zones = nodes.filter((node) => node.type === "zone");
  const resources: Record<string, Cfn> = {};
  const parameters: Record<string, Cfn> = {};
  const outputs: Record<string, Cfn> = {};
  const lambdaStatements: Cfn[] = [];

  const ctx: Ctx = {
    region,
    lid: (id) => lids.get(id) ?? "Unknown",
    byId: (id) => byId.get(id),
    out: (id, serviceId) =>
      edges
        .filter((e) => e.source === id)
        .map((e) => byId.get(e.target))
        .filter((n): n is DesignNode => !!n && (!serviceId || n.data.serviceId === serviceId)),
    inn: (id, serviceId) =>
      edges
        .filter((e) => e.target === id)
        .map((e) => byId.get(e.source))
        .filter((n): n is DesignNode => !!n && (!serviceId || n.data.serviceId === serviceId)),
    zone: (node, serviceId) => {
      const candidates = zones.filter((z) => z.data.serviceId === serviceId && contains(z, node));
      return candidates[0];
    },
    nodesOf: (serviceId) => nodes.filter((n) => n.data.serviceId === serviceId),
    vpcSubnets: (node, opts) => {
      const vpcOf = (n: DesignNode) =>
        zones.find((z) => z.data.serviceId === "vpc" && contains(z, n));
      const vpc =
        vpcOf(node) ??
        (() => {
          const s = zones.find((z) => z.data.serviceId === "subnet" && contains(z, node));
          return s ? vpcOf(s) : undefined;
        })();
      let subs = vpc
        ? zones.filter((z) => z.data.serviceId === "subnet" && contains(vpc, z))
        : zones.filter((z) => z.data.serviceId === "subnet" && contains(z, node));
      if (opts?.publicOnly) subs = subs.filter((s) => s.data.config?.visibility === "public");
      const seen = new Set<string>();
      return subs.filter((s) => {
        const az = String(s.data.config?.az ?? "a");
        if (seen.has(az)) return false;
        seen.add(az);
        return true;
      });
    },
    res: (logicalId, resource) => {
      resources[logicalId] = resource;
    },
    once: (logicalId, make) => {
      if (!resources[logicalId]) resources[logicalId] = make();
      return logicalId;
    },
    param: (name, def) => {
      if (!parameters[name]) parameters[name] = def;
      return name;
    },
    output: (name, value, description) => {
      outputs[name] = { Value: value, Description: description };
    },
    lambdaPolicy: (statement) => {
      lambdaStatements.push(statement);
    },
  };

  const ordered = [...nodes].sort(
    (a, b) => EMIT_ORDER.indexOf(a.data.serviceId) - EMIT_ORDER.indexOf(b.data.serviceId),
  );
  for (const node of ordered) {
    EMITTERS[node.data.serviceId]?.(node, ctx);
  }

  // Attach accumulated access statements to the shared Lambda role.
  if (lambdaStatements.length > 0 && resources.LambdaExecRole) {
    const props = resources.LambdaExecRole.Properties as Record<string, unknown>;
    props.Policies = [
      {
        PolicyName: "kloudarch-connected-resources",
        PolicyDocument: { Version: "2012-10-17", Statement: lambdaStatements },
      },
    ];
  }

  return {
    AWSTemplateFormatVersion: "2010-09-09",
    Description: `${projectName} — generated by KloudArch Studio. Review before deploying.`,
    ...(Object.keys(parameters).length ? { Parameters: parameters } : {}),
    Resources: resources,
    ...(Object.keys(outputs).length ? { Outputs: outputs } : {}),
  };
}

export function generateCloudFormation(input: GenInput): string {
  const template = buildCloudFormationTemplate(input);
  const resources = template.Resources as Record<string, Cfn>;
  if (Object.keys(resources).length === 0) {
    return JSON.stringify(
      {
        AWSTemplateFormatVersion: "2010-09-09",
        Description: "The canvas is empty — drop services onto it and the template appears here.",
        Resources: {},
      },
      null,
      2,
    );
  }
  return JSON.stringify(template, null, 2);
}
