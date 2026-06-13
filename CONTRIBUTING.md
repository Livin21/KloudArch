# Contributing to KloudArch

Thanks for helping draft a better studio. PRs and issues are welcome — this
document covers the 10 minutes you need before your first patch.

## Dev setup

```bash
git clone git@github.com:Livin21/KloudArch.git
cd KloudArch
npm install
npm run dev          # landing on /, studio on /studio
```

The studio works with zero configuration. For the AI copilot, copy
`.env.example` to `.env.local` and add one provider key.

Before pushing:

```bash
npm run lint && npm test && npm run build
```

CI runs exactly those three commands on every PR.

## Tests

The generators and validators are covered by [Vitest](https://vitest.dev):

```bash
npm test          # run once
npm run test:watch
```

`tests/` holds targeted assertions plus **golden snapshots** of every
starter template in both IaC formats (`tests/__snapshots__/`). If you change
a generator on purpose, review the snapshot diff and update it with:

```bash
npx vitest run -u
```

A snapshot diff you didn't expect means your change altered generated IaC for
an existing design — read it before updating.

## Where things live

| Path | What it is |
| --- | --- |
| `src/lib/catalog.ts` | Service registry — categories, config fields, icons |
| `src/lib/terraform.ts` | Design graph → HCL (one emitter per service) |
| `src/lib/cloudformation.ts` | Design graph → CloudFormation JSON (deploy engine) |
| `src/lib/validate.ts` | Design checks shown in the studio |
| `src/lib/store.ts` | Zustand design store — history, persistence, actions |
| `src/lib/templates.ts` | Starter architectures |
| `src/lib/ai-bridge.ts` | AI tool calls → store mutations |
| `tests/` | Vitest suite + golden snapshots |
| `src/components/studio/` | Canvas, palette, inspector, panels |
| `src/app/api/chat/route.ts` | AI SDK route (client-executed tools) |

## Adding a service (the most common contribution)

1. **Catalog entry** in `src/lib/catalog.ts` — id, name, abbr, category,
   lucide icon, blurb, and typed config fields. That alone puts it in the
   palette, inspector, and AI catalog.
2. **Two emitters**, keyed by your service id in the `EMITTERS` records of
   `src/lib/terraform.ts` (returns an HCL string) and
   `src/lib/cloudformation.ts` (calls `ctx.res()` to add resources). Both share
   the same `Ctx` shape — `ctx.out()` / `ctx.inn()` for connected services,
   `ctx.zone()` for VPC/subnet containment, `ctx.once()` for shared blocks.
   Prefer a `# TODO` / placeholder over silently emitting broken IaC.
3. Optionally add a validation rule in `src/lib/validate.ts` if the service
   has an easy-to-miss requirement (e.g. needs a subnet, needs a target).
4. **A test** in `tests/` — assert the key resources/wiring your emitters
   produce (see the existing service blocks for the pattern). Run `npm test`;
   if you added the service to a template, update snapshots with
   `npx vitest run -u`.
5. If the AI should configure it well, make sure the field names are
   self-explanatory — the catalog is injected into the copilot's prompt.

## Style

- TypeScript strict; keep `npm run lint` clean.
- Match the existing visual language: Saira + Chivo Mono, the existing color
  tokens (`bg-panel`, `text-fg-dim`, …), 1px hairlines, mono micro-labels.
- Keep comments for constraints the code can't express, not narration.

## PRs

- One change per PR, with a screenshot/GIF for anything visual.
- Reference an issue when one exists.
- New services: include a small design in the PR description showing the
  generated Terraform for a connected example.
