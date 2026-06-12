import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  type LanguageModel,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { catalogForPrompt } from "@/lib/catalog";

export const maxDuration = 60;

/* ── provider resolution (env-driven) ─────────────────────────────────── */

type ProviderId = "anthropic" | "openai" | "google" | "gateway";

const DEFAULT_MODELS: Record<ProviderId, string> = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-5.5",
  google: "gemini-3.5-flash",
  gateway: "anthropic/claude-sonnet-4.6",
};

function resolveProvider(): { provider: ProviderId; modelId: string } | null {
  const explicit = process.env.AI_PROVIDER?.toLowerCase() as ProviderId | undefined;
  const provider: ProviderId | undefined =
    explicit && DEFAULT_MODELS[explicit]
      ? explicit
      : process.env.ANTHROPIC_API_KEY
        ? "anthropic"
        : process.env.OPENAI_API_KEY
          ? "openai"
          : process.env.GOOGLE_GENERATIVE_AI_API_KEY
            ? "google"
            : process.env.AI_GATEWAY_API_KEY
              ? "gateway"
              : undefined;
  if (!provider) return null;
  return { provider, modelId: process.env.AI_MODEL || DEFAULT_MODELS[provider] };
}

function modelFor(provider: ProviderId, modelId: string): LanguageModel {
  switch (provider) {
    case "anthropic":
      return anthropic(modelId);
    case "openai":
      return openai(modelId);
    case "google":
      return google(modelId);
    case "gateway":
      return modelId; // plain "provider/model" string routes through the AI Gateway
  }
}

/* ── design tools (executed client-side against the canvas store) ─────── */

const configValue = z.union([z.string(), z.number(), z.boolean()]);
const configSchema = z.record(z.string(), configValue);

const tools = {
  add_nodes: tool({
    description:
      "Add one or more components to the canvas. Use catalog service ids. Provide x/y positions following the layout rules; zones (vpc, subnet) also take width/height.",
    inputSchema: z.object({
      nodes: z.array(
        z.object({
          service: z.string().describe("Catalog service id, e.g. 'lambda', 'rds', 'vpc'"),
          label: z.string().optional().describe("Human name, e.g. 'Orders API'"),
          x: z.number().optional(),
          y: z.number().optional(),
          width: z.number().optional().describe("Zones only"),
          height: z.number().optional().describe("Zones only"),
          config: configSchema.optional().describe("Service config keys from the catalog"),
        }),
      ),
    }),
  }),
  connect_nodes: tool({
    description:
      "Draw directed connections between existing components. Reference nodes by id (preferred) or exact label.",
    inputSchema: z.object({
      links: z.array(
        z.object({
          source: z.string(),
          target: z.string(),
          label: z.string().optional().describe("Short edge label, e.g. 'https', 'sql', 'events'"),
        }),
      ),
    }),
  }),
  update_node: tool({
    description: "Rename, reconfigure, or move an existing component.",
    inputSchema: z.object({
      node: z.string().describe("Node id (preferred) or exact label"),
      label: z.string().optional(),
      config: configSchema.optional(),
      x: z.number().optional(),
      y: z.number().optional(),
    }),
  }),
  remove_nodes: tool({
    description: "Remove components (and their connections) from the canvas.",
    inputSchema: z.object({
      nodes: z.array(z.string()).describe("Node ids (preferred) or exact labels"),
    }),
  }),
  clear_canvas: tool({
    description: "Remove everything from the canvas. Only when the user explicitly asks to start over.",
    inputSchema: z.object({}),
  }),
  arrange_layout: tool({
    description: "Auto-arrange all components in a clean left-to-right flow. Zones keep their position.",
    inputSchema: z.object({}),
  }),
};

/* ── prompt ───────────────────────────────────────────────────────────── */

function buildSystem(design: unknown): string {
  return `You are the KloudArch copilot — an expert cloud architect embedded in a visual architecture design studio.

The user designs cloud architectures on an infinite canvas. Service nodes are cards (~190×84 px). Zones (vpc, subnet) are dashed rectangles rendered behind services; a service is considered "inside" a zone when its coordinates fall within the zone's rectangle, and the Terraform generator wires vpc/subnet references from that containment.

LAYOUT RULES
- x grows rightward, y grows downward. Architect flows left → right: clients/edge on the left, compute in the middle, data stores on the right.
- Space sibling nodes ~250 px apart horizontally and ~150 px vertically.
- When extending an existing design, place new nodes near the components they relate to and connect them.
- To nest services in a zone: first add the zone with x/y/width/height, then place services at coordinates inside that rectangle. Subnets go inside VPCs.
- If positions ended up messy and the design has no zones, call arrange_layout once at the end.

BEHAVIOR
- Modify the canvas with tools; never describe JSON or Terraform in prose — the studio generates Terraform live.
- Reference existing nodes by their "id" from CURRENT DESIGN.
- Batch work: one add_nodes call for all new components, then one connect_nodes call.
- Label every connection with a short protocol/purpose word (https, sql, events, cache…).
- Set meaningful config values (instance types, engines, runtimes) instead of leaving defaults when the user's intent implies them.
- After tool calls finish, summarize what changed in at most two sentences. Ask at most one clarifying question, and only when truly blocked.

SERVICE CATALOG (id "name" — config keys)
${catalogForPrompt()}

CURRENT DESIGN
${JSON.stringify(design ?? { nodes: [], edges: [] })}`;
}

/* ── handlers ─────────────────────────────────────────────────────────── */

export async function GET() {
  const resolved = resolveProvider();
  if (!resolved) return Response.json({ configured: false });
  return Response.json({
    configured: true,
    provider: resolved.provider,
    model: resolved.modelId,
  });
}

export async function POST(req: Request) {
  const resolved = resolveProvider();
  if (!resolved) {
    return Response.json(
      { error: "No AI provider configured. Set an API key in .env.local — see .env.example." },
      { status: 503 },
    );
  }

  const { messages, design } = (await req.json()) as {
    messages: UIMessage[];
    design?: unknown;
  };

  const result = streamText({
    model: modelFor(resolved.provider, resolved.modelId),
    system: buildSystem(design),
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(8),
  });

  return result.toUIMessageStreamResponse({
    onError: (error) => {
      console.error("[kloudarch] chat error:", error);
      return "The model call failed — check your API key, model id, and provider quota.";
    },
  });
}
