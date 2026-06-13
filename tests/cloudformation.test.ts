import { describe, expect, it } from "vitest";
import {
  buildCloudFormationTemplate,
  cfnDeployWarnings,
  generateCloudFormation,
} from "@/lib/cloudformation";
import { design, edge, routedVpcDesign, svc } from "./fixtures";

type Resource = { Type: string; Properties?: Record<string, unknown>; DependsOn?: string[] };

function resources(input: Parameters<typeof buildCloudFormationTemplate>[0]) {
  return buildCloudFormationTemplate(input).Resources as Record<string, Resource>;
}
function ofType(res: Record<string, Resource>, type: string) {
  return Object.entries(res).filter(([, r]) => r.Type === type);
}

describe("cloudformation — routed VPC", () => {
  const res = resources(routedVpcDesign());

  it("emits IGW + attachment and one public route table", () => {
    expect(ofType(res, "AWS::EC2::InternetGateway")).toHaveLength(1);
    expect(ofType(res, "AWS::EC2::VPCGatewayAttachment")).toHaveLength(1);
    expect(ofType(res, "AWS::EC2::RouteTable")).toHaveLength(2); // public + private(a)
  });

  it("makes the IGW route depend on the gateway attachment", () => {
    const [, route] = ofType(res, "AWS::EC2::Route").find(
      ([, r]) => "GatewayId" in (r.Properties ?? {}),
    )!;
    expect(route.DependsOn).toEqual([expect.stringContaining("Attachment")]);
  });

  it("emits EIP + NAT and the private route uses NatGatewayId", () => {
    expect(ofType(res, "AWS::EC2::EIP")).toHaveLength(1);
    expect(ofType(res, "AWS::EC2::NatGateway")).toHaveLength(1);
    const natRoute = ofType(res, "AWS::EC2::Route").find(([, r]) => "NatGatewayId" in (r.Properties ?? {}));
    expect(natRoute).toBeDefined();
  });

  it("associates both public subnets and the private subnet", () => {
    expect(ofType(res, "AWS::EC2::SubnetRouteTableAssociation")).toHaveLength(3);
  });

  it("gives the ALB exactly two subnets and a derived SG pair", () => {
    const [, alb] = ofType(res, "AWS::ElasticLoadBalancingV2::LoadBalancer")[0];
    expect((alb.Properties!.Subnets as unknown[]).length).toBe(2);
    expect(ofType(res, "AWS::EC2::SecurityGroup")).toHaveLength(2);
  });

  it("attaches the targets SG to the EC2 instances", () => {
    const instances = ofType(res, "AWS::EC2::Instance");
    expect(instances).toHaveLength(2);
    for (const [, inst] of instances) {
      expect(inst.Properties!.SecurityGroupIds).toBeDefined();
    }
  });
});

describe("cloudformation — service shapes", () => {
  it("RDS manages its own master password (no secret in the template)", () => {
    const res = resources(design([svc("db", "rds", "DB", { engine: "postgres" }, { x: 0, y: 0 })]));
    const [, rds] = ofType(res, "AWS::RDS::DBInstance")[0];
    expect(rds.Properties!.ManageMasterUserPassword).toBe(true);
    expect(JSON.stringify(rds.Properties)).not.toContain("MasterUserPassword\":\"");
  });

  it("Step Functions definition is a JSON object ordered by x-position", () => {
    const res = resources(
      design(
        [
          svc("sfn", "step-functions", "Flow", {}, { x: 100, y: 0 }),
          svc("b", "lambda", "Second", {}, { x: 600, y: 0 }),
          svc("a", "lambda", "First", {}, { x: 300, y: 0 }),
        ],
        [edge("e1", "sfn", "a"), edge("e2", "sfn", "b")],
      ),
    );
    const [, sm] = ofType(res, "AWS::StepFunctions::StateMachine")[0];
    const def = sm.Properties!.Definition as { States: Record<string, { Resource?: unknown }> };
    expect(JSON.stringify(def.States.Step1.Resource)).toContain("First");
    expect(JSON.stringify(def.States.Step2.Resource)).toContain("Second");
  });

  it("Kinesis → lambda mapping sets the required StartingPosition", () => {
    const res = resources(
      design(
        [svc("k", "kinesis", "Stream", { mode: "ON_DEMAND" }, { x: 0, y: 0 }), svc("fn", "lambda", "Fn", {}, { x: 300, y: 0 })],
        [edge("e1", "k", "fn")],
      ),
    );
    const [, esm] = ofType(res, "AWS::Lambda::EventSourceMapping")[0];
    expect(esm.Properties!.StartingPosition).toBe("LATEST");
  });

  it("ACM validation wires to an exact-match zone only", () => {
    const matched = resources(
      design(
        [svc("z", "route53", "Zone", { domain: "a.example.com" }, { x: 0, y: 0 }), svc("c", "acm-cert", "Cert", { domain: "a.example.com" }, { x: 300, y: 0 })],
      ),
    );
    const [, cert] = ofType(matched, "AWS::CertificateManager::Certificate")[0];
    expect(cert.Properties!.DomainValidationOptions).toBeDefined();

    const mismatched = resources(
      design(
        [svc("z", "route53", "Zone", { domain: "other.example.com" }, { x: 0, y: 0 }), svc("c", "acm-cert", "Cert", { domain: "a.example.com" }, { x: 300, y: 0 })],
      ),
    );
    const [, cert2] = ofType(mismatched, "AWS::CertificateManager::Certificate")[0];
    expect(cert2.Properties!.DomainValidationOptions).toBeUndefined();
  });

  it("CloudFront takes an ACM cert only in us-east-1", () => {
    const nodes = () => [
      svc("c", "acm-cert", "Cert", { domain: "cdn.example.com" }, { x: 0, y: 0 }),
      svc("cdn", "cloudfront", "CDN", {}, { x: 300, y: 0 }),
      svc("b", "s3", "Bucket", {}, { x: 600, y: 0 }),
    ];
    const edges = [edge("e1", "c", "cdn"), edge("e2", "cdn", "b")];

    const east = resources(design(nodes(), edges, { region: "us-east-1" }));
    const [, dist] = ofType(east, "AWS::CloudFront::Distribution")[0];
    expect((dist.Properties!.DistributionConfig as { ViewerCertificate: Record<string, unknown> }).ViewerCertificate.AcmCertificateArn).toBeDefined();

    const eu = resources(design(nodes(), edges, { region: "eu-west-1" }));
    const [, dist2] = ofType(eu, "AWS::CloudFront::Distribution")[0];
    expect((dist2.Properties!.DistributionConfig as { ViewerCertificate: Record<string, unknown> }).ViewerCertificate.CloudFrontDefaultCertificate).toBe(true);
  });
});

describe("cloudformation — deploy warnings", () => {
  it("flags the ACM same-stack-zone hang risk", () => {
    const warnings = cfnDeployWarnings(
      design(
        [svc("z", "route53", "Zone", { domain: "app.example.com" }, { x: 0, y: 0 }), svc("c", "acm-cert", "Cert", { domain: "app.example.com" }, { x: 300, y: 0 })],
      ),
    );
    expect(warnings.some((w) => w.includes("delegated"))).toBe(true);
  });

  it("warns when a non-inline lambda runtime falls back", () => {
    const warnings = cfnDeployWarnings(design([svc("fn", "lambda", "JavaFn", { runtime: "java21" }, { x: 0, y: 0 })]));
    expect(warnings.some((w) => w.includes("java21"))).toBe(true);
  });

  it("warns that HTTPS without a cert falls back to HTTP", () => {
    const warnings = cfnDeployWarnings(design([svc("alb", "alb", "ALB", { protocol: "HTTPS" }, { x: 0, y: 0 })]));
    expect(warnings.some((w) => w.toLowerCase().includes("http"))).toBe(true);
  });
});

describe("cloudformation — template size guardrail", () => {
  it("stays within CloudFormation's inline body limit for a large design", () => {
    const nodes = Array.from({ length: 30 }, (_, i) => svc(`n${i}`, "s3", `Bucket ${i}`, {}, { x: i * 50, y: 0 }));
    const out = generateCloudFormation(design(nodes));
    expect(Buffer.byteLength(out, "utf8")).toBeLessThan(51_200);
  });
});
