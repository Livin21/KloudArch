import { describe, expect, it } from "vitest";
import { TEMPLATES } from "@/lib/templates";
import { lintCounts, validateDesign } from "@/lib/validate";
import { design, edge, routedVpcDesign, svc, zone } from "./fixtures";

function lints(d: ReturnType<typeof design>) {
  return validateDesign(d.nodes, d.edges);
}

describe("validate — starter templates are clean of warnings", () => {
  for (const template of TEMPLATES) {
    it(`${template.id} has zero warn-level lints`, () => {
      const { warns } = lintCounts(validateDesign(template.nodes, template.edges));
      expect(warns).toBe(0);
    });
  }
});

describe("validate — routed VPC fixture passes", () => {
  it("produces no warnings", () => {
    expect(lintCounts(lints(routedVpcDesign())).warns).toBe(0);
  });
});

describe("validate — networking rules", () => {
  it("warns when a NAT sits outside a public subnet", () => {
    const result = lints(
      design([
        zone("vpc", "vpc", "VPC", { x: 0, y: 0, width: 600, height: 400 }, { cidr: "10.0.0.0/16" }),
        svc("nat", "nat-gateway", "Stray NAT", {}, { x: 700, y: 700 }),
      ]),
    );
    expect(result.some((l) => l.message.includes("public subnet"))).toBe(true);
  });

  it("warns when public subnets exist without an internet gateway", () => {
    const result = lints(
      design([
        zone("vpc", "vpc", "VPC", { x: 0, y: 0, width: 600, height: 400 }, { cidr: "10.0.0.0/16" }),
        zone("pub", "subnet", "Public", { x: 20, y: 20, width: 200, height: 150 }, { cidr: "10.0.1.0/24", visibility: "public", az: "a" }),
      ]),
    );
    expect(result.some((l) => l.id.startsWith("public-subnet-no-igw"))).toBe(true);
  });

  it("warns when an internet-facing ALB lacks two AZs", () => {
    const result = lints(
      design(
        [
          zone("vpc", "vpc", "VPC", { x: 0, y: 0, width: 600, height: 400 }, { cidr: "10.0.0.0/16" }),
          zone("pub", "subnet", "Public", { x: 20, y: 20, width: 400, height: 350 }, { cidr: "10.0.1.0/24", visibility: "public", az: "a" }),
          svc("igw", "internet-gateway", "IGW", {}, { x: 500, y: 380 }),
          svc("alb", "alb", "ALB", { scheme: "internet-facing" }, { x: 30, y: 40 }),
          svc("web", "ec2", "Web", {}, { x: 200, y: 40 }),
        ],
        [edge("e1", "alb", "web")],
      ),
    );
    expect(result.some((l) => l.id.startsWith("alb-one-az"))).toBe(true);
  });
});

describe("validate — service rules", () => {
  it("warns a bare load balancer about subnets and targets", () => {
    const result = lints(design([svc("alb", "alb", "Lonely ALB", {}, { x: 0, y: 0 })]));
    const ids = result.map((l) => l.id.split(":")[0]);
    expect(ids).toContain("alb-subnet");
    expect(ids).toContain("alb-targets");
  });

  it("does not flag containment-driven IGW/NAT as orphans", () => {
    const result = lints(
      design([
        zone("vpc", "vpc", "VPC", { x: 0, y: 0, width: 600, height: 400 }, { cidr: "10.0.0.0/16" }),
        zone("pub", "subnet", "Public", { x: 20, y: 20, width: 200, height: 150 }, { cidr: "10.0.1.0/24", visibility: "public", az: "a" }),
        svc("igw", "internet-gateway", "IGW", {}, { x: 30, y: 40 }),
      ]),
    );
    expect(result.some((l) => l.id.startsWith("orphan") && l.nodeIds.includes("igw"))).toBe(false);
  });

  it("returns lint objects with stable shape", () => {
    const result = lints(design([svc("alb", "alb", "ALB", {}, { x: 0, y: 0 })]));
    for (const l of result) {
      expect(l).toMatchObject({
        id: expect.any(String),
        severity: expect.stringMatching(/^(warn|info)$/),
        message: expect.any(String),
        nodeIds: expect.any(Array),
      });
    }
  });
});
