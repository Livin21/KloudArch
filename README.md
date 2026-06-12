# KloudArch Studio

**Open-source cloud architecture design studio.** Draft architectures on a
blueprint-style canvas, refine them with an AI copilot, and export working
Terraform — all in the browser.

> v0.1 — the architecture design studio. One-click deployment lands in v0.2.

## Features

- **Drafting canvas** — drag 22 AWS-flavored components (compute, network,
  data, storage, messaging, security…) onto an infinite blueprint grid,
  wire them together, and group them in resizable VPC / subnet zones.
- **Live Terraform** — the `main.tf` for your design is regenerated on every
  edit. Connections become real wiring: ALB target groups, API Gateway → Lambda
  integrations, SQS event source mappings, CloudFront origins, Route 53 aliases.
  Services dropped inside VPC/subnet zones get the right `vpc_id` / `subnet_id`
  references from geometric containment.
- **AI copilot** — describe what you want ("make this event-driven", "add a
  cache layer") and the assistant edits the canvas through tools. Bring your
  own key: Anthropic, OpenAI, Google, or the Vercel AI Gateway, configured
  entirely through environment variables.
- **Templates** — three-tier web app, serverless API, event-driven pipeline,
  static site + CDN — or start from a blank sheet.
- **Studio ergonomics** — undo/redo, duplicate, auto-arrange (dagre),
  multi-select, snap-to-grid, minimap, autosave to localStorage, and
  import/export of portable `.kloudarch.json` design files.

## Quickstart

```bash
npm install
npm run dev
```

Open http://localhost:3000 — the studio works fully without any configuration.

### Enable the AI copilot

```bash
cp .env.example .env.local
# add ONE key, then restart the dev server
```

| Variable | Notes |
| --- | --- |
| `ANTHROPIC_API_KEY` | default model `claude-sonnet-4-6` |
| `OPENAI_API_KEY` | default model `gpt-5.5` |
| `GOOGLE_GENERATIVE_AI_API_KEY` | default model `gemini-3.5-flash` |
| `AI_GATEWAY_API_KEY` | Vercel AI Gateway, default `anthropic/claude-sonnet-4.6` |
| `AI_PROVIDER` *(optional)* | force `anthropic` / `openai` / `google` / `gateway` |
| `AI_MODEL` *(optional)* | override the default model id |

Keys never leave your server: the browser talks to `/api/chat`, which calls
the provider with the key from your environment.

## How it works

```
src/
├─ lib/
│  ├─ catalog.ts      # service registry: categories, config fields, icons
│  ├─ store.ts        # zustand design store: history, persistence, actions
│  ├─ terraform.ts    # design graph → HCL (per-service emitters + edge wiring)
│  ├─ templates.ts    # starter architectures
│  ├─ autolayout.ts   # dagre left-to-right arrangement
│  └─ ai-bridge.ts    # AI tool calls → store mutations
├─ components/studio/ # canvas, palette, inspector, terraform panel, chat
└─ app/api/chat/      # AI SDK streamText route with client-executed tools
```

The AI copilot uses [AI SDK v6](https://ai-sdk.dev) client-side tools: the
model streams tool calls (`add_nodes`, `connect_nodes`, …), the browser applies
them to the canvas store, and the results stream back for the next step. Every
request includes a compact snapshot of the current design, so the copilot
always works with what you see.

## Roadmap

- **v0.2** — deploy from the studio (Terraform plan/apply runner with
  credential isolation), multi-file Terraform output, design validation lints
- GCP / Azure catalogs, custom components
- Shareable links and real-time collaboration

## Contributing

Issues and PRs welcome. The service catalog (`src/lib/catalog.ts`) and the
Terraform emitters (`src/lib/terraform.ts`) are designed to be easy to extend —
adding a service is one catalog entry plus one emitter.

## License

[MIT](./LICENSE)
