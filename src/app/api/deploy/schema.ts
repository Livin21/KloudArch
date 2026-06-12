import { z } from "zod";
import type { GenInput } from "@/lib/terraform";

export const REGION_RE = /^[a-z]{2,4}-[a-z]+-\d$/;

const nodeSchema = z.looseObject({
  id: z.string(),
  type: z.string().optional(),
  position: z.object({ x: z.number(), y: z.number() }),
  width: z.number().optional(),
  height: z.number().optional(),
  data: z.looseObject({
    serviceId: z.string(),
    label: z.string().min(1).max(120),
    config: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  }),
});

const edgeSchema = z.looseObject({
  id: z.string(),
  source: z.string(),
  target: z.string(),
});

export const designSchema = z.object({
  projectName: z.string().min(1).max(100),
  region: z.string().regex(REGION_RE),
  nodes: z.array(nodeSchema).max(500),
  edges: z.array(edgeSchema).max(1000),
});

export function parseDesign(value: unknown): GenInput | null {
  const parsed = designSchema.safeParse(value);
  return parsed.success ? (parsed.data as unknown as GenInput) : null;
}

/** All deploy routes only ever touch stacks the studio created. */
export function isKloudarchStack(name: string): boolean {
  return /^kloudarch-[a-z0-9-]{1,100}$/.test(name);
}
