import { describe, expect, it } from "vitest";
import { generateTerraform } from "@/lib/terraform";
import { design, edge, routedVpcDesign, svc, zone } from "./fixtures";

describe("terraform — routed VPC", () => {
  const tf = generateTerraform(routedVpcDesign());

  it("emits an internet gateway attached to the VPC", () => {
    expect(tf).toContain('resource "aws_internet_gateway" "edge_igw"');
    expect(tf).toContain("vpc_id = aws_vpc.app_vpc.id");
  });

  it("derives a public route table to the IGW with subnet associations", () => {
    expect(tf).toContain('resource "aws_route_table" "app_vpc_public"');
    expect(tf).toMatch(/gateway_id\s+= aws_internet_gateway\.edge_igw\.id/);
    expect((tf.match(/aws_route_table_association" "\w+_public"/g) ?? []).length).toBe(2);
  });

  it("emits an EIP + NAT and an AZ-keyed private route table", () => {
    expect(tf).toContain('resource "aws_eip" "egress_nat"');
    expect(tf).toContain('domain = "vpc"');
    expect(tf).toContain('resource "aws_nat_gateway" "egress_nat"');
    expect(tf).toContain('resource "aws_route_table" "app_vpc_private_a"');
    expect(tf).toMatch(/nat_gateway_id\s+= aws_nat_gateway\.egress_nat\.id/);
  });

  it("gives the ALB both public subnets in distinct AZs", () => {
    expect(tf).toMatch(/subnets\s+= \[aws_subnet\.public_a\.id, aws_subnet\.public_b\.id\]/);
  });

  it("derives the ALB security-group chain", () => {
    expect(tf).toContain('resource "aws_security_group" "web_alb_sg"');
    expect(tf).toContain('resource "aws_security_group" "web_alb_targets_sg"');
    expect(tf).toContain("security_groups = [aws_security_group.web_alb_sg.id]");
  });

  it("attaches the targets SG to the EC2 instances", () => {
    expect(tf).toContain("vpc_security_group_ids = [aws_security_group.web_alb_targets_sg.id]");
  });
});

describe("terraform — ACM certificates", () => {
  it("upgrades the ALB listener to HTTPS and wires validation to a matching zone", () => {
    const tf = generateTerraform(
      design(
        [
          zone("vpc", "vpc", "VPC", { x: 0, y: 0, width: 600, height: 400 }, { cidr: "10.0.0.0/16" }),
          zone("pa", "subnet", "PA", { x: 20, y: 20, width: 200, height: 150 }, { cidr: "10.0.1.0/24", visibility: "public", az: "a" }),
          zone("pb", "subnet", "PB", { x: 20, y: 200, width: 200, height: 150 }, { cidr: "10.0.2.0/24", visibility: "public", az: "b" }),
          svc("dns", "route53", "Shop Zone", { domain: "shop.example.com" }, { x: 700, y: 40 }),
          svc("cert", "acm-cert", "Shop Cert", { domain: "shop.example.com" }, { x: 700, y: 160 }),
          svc("alb", "alb", "Edge ALB", { scheme: "internet-facing", protocol: "HTTPS", listener_port: 443 }, { x: 30, y: 40 }),
          svc("web", "ec2", "Web", { count: 1 }, { x: 300, y: 40 }),
        ],
        [edge("e1", "cert", "alb"), edge("e2", "alb", "web")],
      ),
    );
    expect(tf).toContain('resource "aws_acm_certificate" "shop_cert"');
    expect(tf).toContain('resource "aws_acm_certificate_validation" "shop_cert"');
    expect(tf).toMatch(/protocol\s+= "HTTPS"/);
    expect(tf).toContain("certificate_arn   = aws_acm_certificate_validation.shop_cert.certificate_arn");
  });

  it("uses a us-east-1 provider alias for a CloudFront cert outside us-east-1", () => {
    const tf = generateTerraform(
      design(
        [
          svc("cert", "acm-cert", "CDN Cert", { domain: "cdn.example.com" }, { x: 0, y: 0 }),
          svc("cdn", "cloudfront", "CDN", {}, { x: 300, y: 0 }),
          svc("bucket", "s3", "Assets", {}, { x: 600, y: 0 }),
        ],
        [edge("e1", "cert", "cdn"), edge("e2", "cdn", "bucket")],
        { region: "eu-west-1" },
      ),
    );
    expect(tf).toMatch(/provider\s+= aws\.us_east_1/);
    expect(tf).toMatch(/alias\s+= "us_east_1"/);
  });
});

describe("terraform — Step Functions", () => {
  it("orders task states by node x-position and grants invoke", () => {
    const tf = generateTerraform(
      design(
        [
          svc("sfn", "step-functions", "Flow", { type: "STANDARD" }, { x: 100, y: 0 }),
          svc("b", "lambda", "Second Fn", {}, { x: 600, y: 0 }),
          svc("a", "lambda", "First Fn", {}, { x: 300, y: 0 }),
        ],
        [edge("e1", "sfn", "a"), edge("e2", "sfn", "b")],
      ),
    );
    expect(tf).toContain('resource "aws_sfn_state_machine" "flow"');
    expect(tf).toContain('Principal = { Service = "states.amazonaws.com" }');
    // Within the state-machine definition, First Fn (x=300) precedes Second Fn (x=600).
    const sfnBlock = tf.slice(tf.indexOf('"aws_sfn_state_machine"'));
    expect(sfnBlock.indexOf("first_fn")).toBeLessThan(sfnBlock.indexOf("second_fn"));
  });

  it("gives EventBridge → SFN targets the required role", () => {
    const tf = generateTerraform(
      design(
        [
          svc("bus", "eventbridge", "Bus", { bus_name: "events" }, { x: 0, y: 0 }),
          svc("sfn", "step-functions", "Flow", {}, { x: 300, y: 0 }),
        ],
        [edge("e1", "bus", "sfn")],
      ),
    );
    expect(tf).toContain('resource "aws_iam_role" "events_to_sfn"');
    expect(tf).toContain("role_arn       = aws_iam_role.events_to_sfn.arn");
  });
});

describe("terraform — Kinesis", () => {
  it("wires a kinesis → lambda event source mapping with the managed read policy", () => {
    const tf = generateTerraform(
      design(
        [
          svc("k", "kinesis", "Clicks", { mode: "ON_DEMAND" }, { x: 0, y: 0 }),
          svc("fn", "lambda", "Consumer", {}, { x: 300, y: 0 }),
        ],
        [edge("e1", "k", "fn")],
      ),
    );
    expect(tf).toContain('resource "aws_kinesis_stream" "clicks"');
    expect(tf).toContain('starting_position = "LATEST"');
    expect(tf).toContain("AWSLambdaKinesisExecutionRole");
  });

  it("injects STREAM_NAME for a lambda producer", () => {
    const tf = generateTerraform(
      design(
        [
          svc("fn", "lambda", "Producer", {}, { x: 0, y: 0 }),
          svc("k", "kinesis", "Events", { mode: "ON_DEMAND" }, { x: 300, y: 0 }),
        ],
        [edge("e1", "fn", "k")],
      ),
    );
    expect(tf).toContain("STREAM_NAME");
    expect(tf).toContain("aws_kinesis_stream.events.name");
  });
});

describe("terraform — lambda data-store wiring", () => {
  it("injects the table name and grants DynamoDB access", () => {
    const tf = generateTerraform(
      design(
        [
          svc("fn", "lambda", "Api", {}, { x: 0, y: 0 }),
          svc("t", "dynamodb", "Items", { hash_key: "id" }, { x: 300, y: 0 }),
        ],
        [edge("e1", "fn", "t")],
      ),
    );
    expect(tf).toContain("TABLE_NAME");
    expect(tf).toContain("aws_dynamodb_table.items.name");
  });
});
