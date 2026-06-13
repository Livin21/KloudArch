import { describe, expect, it } from "vitest";
import { generateCloudFormation } from "@/lib/cloudformation";
import { generateTerraform, type GenInput } from "@/lib/terraform";
import { TEMPLATES } from "@/lib/templates";

/** Each starter template, as a generator input. */
function inputFor(t: (typeof TEMPLATES)[number]): GenInput {
  return { projectName: t.name, region: "us-east-1", nodes: t.nodes, edges: t.edges };
}

describe("template golden output", () => {
  for (const template of TEMPLATES) {
    it(`${template.id} → Terraform`, () => {
      expect(generateTerraform(inputFor(template))).toMatchSnapshot();
    });

    it(`${template.id} → CloudFormation`, () => {
      expect(generateCloudFormation(inputFor(template))).toMatchSnapshot();
    });
  }
});

describe("CloudFormation templates are valid JSON", () => {
  for (const template of TEMPLATES) {
    it(`${template.id} parses with the expected top-level shape`, () => {
      const parsed = JSON.parse(generateCloudFormation(inputFor(template)));
      expect(parsed.AWSTemplateFormatVersion).toBe("2010-09-09");
      expect(Object.keys(parsed.Resources).length).toBeGreaterThan(0);
    });
  }
});

describe("generation is deterministic", () => {
  for (const template of TEMPLATES) {
    it(`${template.id} produces identical output across runs`, () => {
      const input = inputFor(template);
      expect(generateTerraform(input)).toBe(generateTerraform(input));
      expect(generateCloudFormation(input)).toBe(generateCloudFormation(input));
    });
  }
});

describe("empty design", () => {
  const empty: GenInput = { projectName: "Empty", region: "us-east-1", nodes: [], edges: [] };

  it("Terraform returns a stable header-only file", () => {
    const out = generateTerraform(empty);
    expect(out).toContain("terraform {");
    expect(out).not.toContain("resource ");
  });

  it("CloudFormation returns parseable JSON with no resources", () => {
    const parsed = JSON.parse(generateCloudFormation(empty));
    expect(parsed.Resources).toEqual({});
  });
});
