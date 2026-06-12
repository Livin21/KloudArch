import {
  ArrowRight,
  Box,
  Cable,
  Check,
  DraftingCompass,
  FileCode2,
  LayoutTemplate,
  Plus,
  Rocket,
  ShieldCheck,
  Sparkles,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { LogoLockup, LogoMark } from "@/components/Logo";

const GITHUB_URL = "https://github.com/Livin21/KloudArch";

function GitHubIcon({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

/* ── Nav ──────────────────────────────────────────────────────────────── */

function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-ink/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-5">
        <Link href="/" aria-label="KloudArch home">
          <LogoLockup markSize={26} />
        </Link>
        <nav className="ml-4 hidden items-center gap-5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-fg-faint md:flex">
          <a href="#features" className="transition-colors hover:text-fg">Features</a>
          <a href="#workflow" className="transition-colors hover:text-fg">Workflow</a>
          <a href="#copilot" className="transition-colors hover:text-fg">Copilot</a>
          <a href="#deploy" className="transition-colors hover:text-fg">Deploy</a>
        </nav>
        <div className="flex-1" />
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noreferrer"
          className="u-btn !h-9"
        >
          <GitHubIcon />
          <span className="hidden sm:inline">GitHub</span>
        </a>
        <Link
          href="/studio"
          className="inline-flex h-9 items-center gap-1.5 rounded-[3px] bg-amber px-4 text-[12.5px] font-semibold text-ink transition-colors hover:bg-[#ffc452]"
        >
          Launch Studio
          <ArrowRight size={13} />
        </Link>
      </div>
    </header>
  );
}

/* ── Hero ─────────────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section className="bp-grid relative overflow-hidden">
      <div className="pointer-events-none absolute -top-48 left-1/2 h-[560px] w-[980px] -translate-x-1/2 rounded-full bg-accent/[0.07] blur-[120px]" />
      <span className="pointer-events-none absolute left-6 top-8 font-mono text-fg-faint/50">+</span>
      <span className="pointer-events-none absolute right-6 top-8 font-mono text-fg-faint/50">+</span>

      <div className="mx-auto max-w-6xl px-5 pb-20 pt-20 md:pt-28">
        <p className="anim-rise u-label !text-accent" style={{ animationDelay: "0ms" }}>
          Open source · MIT · Bring your own model
        </p>
        <h1
          className="anim-rise mt-5 max-w-3xl text-5xl font-bold leading-[0.98] tracking-tight text-fg md:text-7xl"
          style={{ animationDelay: "80ms" }}
        >
          Cloud architecture,
          <br />
          <span className="text-amber">drafted.</span>
        </h1>
        <p
          className="anim-rise mt-6 max-w-xl text-[15px] leading-relaxed text-fg-dim md:text-base"
          style={{ animationDelay: "160ms" }}
        >
          KloudArch is a studio for designing cloud architectures on a blueprint
          canvas — wire services together, let the AI copilot extend the design,
          then ship it: reviewable CloudFormation deploys straight from the
          studio, portable Terraform when you&apos;d rather apply it yourself.
        </p>

        <div className="anim-rise mt-8 flex flex-wrap items-center gap-3" style={{ animationDelay: "240ms" }}>
          <Link
            href="/studio"
            className="inline-flex h-11 items-center gap-2 rounded-[3px] bg-amber px-6 text-[14px] font-semibold text-ink transition-colors hover:bg-[#ffc452]"
          >
            Launch the Studio
            <ArrowRight size={15} />
          </Link>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="u-btn !h-11 !px-5 !text-[13px]"
          >
            <GitHubIcon size={15} />
            Star on GitHub
          </a>
          <code className="hidden items-center gap-2 rounded-[3px] border border-line bg-panel px-4 py-2.5 font-mono text-[11px] text-fg-faint lg:flex">
            <span className="text-accent">$</span> git clone {GITHUB_URL.replace("https://", "")}.git
          </code>
        </div>

        {/* Framed studio shot */}
        <div className="anim-rise relative mt-16" style={{ animationDelay: "340ms" }}>
          <div className="pointer-events-none absolute -inset-6 -z-10 rounded-full bg-accent/[0.06] blur-3xl" />
          <span className="pointer-events-none absolute -left-1.5 -top-1.5 z-10 h-4 w-4 border-l-2 border-t-2 border-amber" />
          <span className="pointer-events-none absolute -right-1.5 -top-1.5 z-10 h-4 w-4 border-r-2 border-t-2 border-amber" />
          <span className="pointer-events-none absolute -bottom-1.5 -left-1.5 z-10 h-4 w-4 border-b-2 border-l-2 border-amber" />
          <span className="pointer-events-none absolute -bottom-1.5 -right-1.5 z-10 h-4 w-4 border-b-2 border-r-2 border-amber" />
          <div className="overflow-hidden rounded-[4px] border border-line-bright bg-panel shadow-[0_32px_120px_rgba(0,0,0,0.55)]">
            <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-danger/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-ok/70" />
              <span className="ml-3 font-mono text-[10px] tracking-[0.1em] text-fg-faint">
                kloudarch — /studio
              </span>
            </div>
            <Image
              src="/studio.png"
              alt="The KloudArch studio: a three-tier web app drafted on the blueprint canvas with live Terraform alongside"
              width={1600}
              height={900}
              priority
              className="w-full"
            />
          </div>
          <p className="mt-4 text-center font-mono text-[9.5px] uppercase tracking-[0.16em] text-fg-faint">
            Fig. 01 — Three-tier web app, drafted in the studio · Terraform generated live
          </p>
        </div>
      </div>
    </section>
  );
}

/* ── Stats strip ──────────────────────────────────────────────────────── */

function Stats() {
  const stats: [string, string][] = [
    ["27", "Cloud services"],
    ["2", "IaC formats, live"],
    ["1-click", "Deploy & teardown"],
    ["MIT", "Licensed, self-hosted"],
  ];
  return (
    <section className="border-y border-line bg-panel/50">
      <div className="mx-auto grid max-w-6xl grid-cols-2 md:grid-cols-4">
        {stats.map(([value, label], i) => (
          <div
            key={label}
            className={`px-5 py-6 text-center ${i > 0 ? "border-l border-line" : ""}`}
          >
            <p className="text-2xl font-bold tracking-wide text-fg">{value}</p>
            <p className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.14em] text-fg-faint">
              {label}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Features ─────────────────────────────────────────────────────────── */

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: DraftingCompass,
    title: "A real drafting table",
    body: "Infinite canvas with snap-to-grid, drag-and-drop services, labeled connections, undo history, minimap, and a CAD-style readout tracking your cursor.",
  },
  {
    icon: FileCode2,
    title: "Live IaC, two dialects",
    body: "Every edit regenerates main.tf and a deployable CloudFormation template. Connections become target groups, API integrations, event mappings and CDN origins — in both formats.",
  },
  {
    icon: Box,
    title: "Zones that mean something",
    body: "Drop services inside VPC and subnet rectangles, and the generator derives vpc_id and subnet_id references from geometric containment.",
  },
  {
    icon: Sparkles,
    title: "A copilot with hands",
    body: "The assistant doesn't describe changes — it makes them, through tool calls that add, wire, reconfigure and arrange components on the canvas.",
  },
  {
    icon: LayoutTemplate,
    title: "Start from a sheet",
    body: "Three-tier web app, serverless API, event-driven pipeline, static site + CDN — or a blank sheet and a one-line prompt.",
  },
  {
    icon: ShieldCheck,
    title: "Yours, locally",
    body: "Designs autosave to your browser, model keys live server-side in your env, and the whole studio is MIT-licensed and self-hosted. No accounts.",
  },
];

function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-24">
      <p className="u-label !text-accent">Index — Capabilities</p>
      <h2 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight text-fg md:text-4xl">
        Everything a drafting table for the cloud should do.
      </h2>
      <div className="mt-12 grid gap-px overflow-hidden rounded-[4px] border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f, i) => (
          <article key={f.title} className="group relative bg-panel p-6 transition-colors hover:bg-raised">
            <span className="pointer-events-none absolute left-2 top-2 h-2.5 w-2.5 border-l border-t border-amber opacity-0 transition-opacity group-hover:opacity-100" />
            <span className="pointer-events-none absolute bottom-2 right-2 h-2.5 w-2.5 border-b border-r border-amber opacity-0 transition-opacity group-hover:opacity-100" />
            <div className="flex items-center justify-between">
              <span className="flex h-9 w-9 items-center justify-center rounded-[3px] bg-accent/10 text-accent">
                <f.icon size={17} strokeWidth={1.6} />
              </span>
              <span className="font-mono text-[9px] tracking-[0.14em] text-fg-faint">
                F-{String(i + 1).padStart(2, "0")}
              </span>
            </div>
            <h3 className="mt-4 text-[15px] font-semibold text-fg">{f.title}</h3>
            <p className="mt-2 text-[12.5px] leading-relaxed text-fg-dim">{f.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

/* ── Workflow ─────────────────────────────────────────────────────────── */

function MiniNode({ label, sub, color }: { label: string; sub: string; color: string }) {
  return (
    <div className="w-[120px] rounded-[3px] border border-[rgba(140,170,205,0.2)] bg-ink px-2.5 py-2">
      <p className="truncate text-[10.5px] font-semibold text-fg">{label}</p>
      <p className="truncate font-mono text-[7px] uppercase tracking-[0.14em]" style={{ color }}>
        {sub}
      </p>
    </div>
  );
}

function Workflow() {
  return (
    <section id="workflow" className="scroll-mt-20 border-y border-line bg-panel/40">
      <div className="mx-auto max-w-6xl px-5 py-24">
        <p className="u-label !text-accent">Procedure — Sheet to ship</p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight text-fg md:text-4xl">
          Three steps. No YAML safari.
        </h2>
        <div className="mt-12 grid gap-10 md:grid-cols-3">
          {/* 01 Draft */}
          <div>
            <p className="outline-number font-mono text-6xl font-bold">01</p>
            <h3 className="mt-3 font-mono text-[11px] uppercase tracking-[0.16em] text-amber">Draft</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-fg-dim">
              Drag services onto the sheet, wire the data flow, and group them
              into VPC and subnet zones — or ask the copilot to do it.
            </p>
            <div className="mt-5 flex h-36 items-center justify-center gap-2 rounded-[4px] border border-line bg-deep">
              <MiniNode label="Web ALB" sub="Load balancer" color="#a78bfa" />
              <span className="flex items-center text-fg-faint">
                <span className="block h-px w-5 bg-line-bright" />
                <ArrowRight size={10} />
              </span>
              <MiniNode label="App Servers" sub="EC2 · ×2" color="#ffa94d" />
            </div>
          </div>
          {/* 02 Generate */}
          <div>
            <p className="outline-number font-mono text-6xl font-bold">02</p>
            <h3 className="mt-3 font-mono text-[11px] uppercase tracking-[0.16em] text-amber">Generate</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-fg-dim">
              The Terraform tab tracks the canvas in real time — what you see on
              the sheet is what lands in main.tf.
            </p>
            <pre className="mt-5 h-36 overflow-hidden rounded-[4px] border border-line bg-deep p-4 font-mono text-[10px] leading-[1.7] text-fg-dim">
              <span className="text-[#a78bfa]">resource</span>{" "}
              <span className="text-[#e3c47e]">&quot;aws_lb&quot;</span>{" "}
              <span className="text-[#e3c47e]">&quot;web_alb&quot;</span> {"{"}
              {"\n"}  load_balancer_type = <span className="text-[#e3c47e]">&quot;application&quot;</span>
              {"\n"}  subnets = [aws_subnet.public.id]
              {"\n"}{"}"}
              {"\n"}
              {"\n"}<span className="text-[#a78bfa]">resource</span>{" "}
              <span className="text-[#e3c47e]">&quot;aws_lb_target_group&quot;</span> …
            </pre>
          </div>
          {/* 03 Deploy */}
          <div>
            <p className="outline-number font-mono text-6xl font-bold">03</p>
            <h3 className="mt-3 font-mono text-[11px] uppercase tracking-[0.16em] text-amber">Deploy</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-fg-dim">
              Review the change set and deploy from the studio — or export the
              IaC and apply it yourself. Teardown is one typed confirmation.
            </p>
            <div className="mt-5 flex h-36 flex-col justify-center gap-2 rounded-[4px] border border-line bg-deep p-4 font-mono text-[10.5px]">
              <p className="text-fg-dim">
                change set: <span className="text-ok">6 add</span> ·{" "}
                <span className="text-amber">0 modify</span> ·{" "}
                <span className="text-danger">0 remove</span>
              </p>
              <p className="text-fg-dim">WorkerFn… CREATE_IN_PROGRESS</p>
              <p className="text-ok">CREATE_COMPLETE — stack deployed</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Copilot ──────────────────────────────────────────────────────────── */

function ChatChip({ icon: Icon, label, result }: { icon: LucideIcon; label: string; result: string }) {
  return (
    <div className="flex items-center gap-2 rounded-[3px] border border-line bg-ink px-2.5 py-1.5">
      <Icon size={11} className="shrink-0 text-accent" />
      <span className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-fg-dim">{label}</span>
      <span className="truncate font-mono text-[8.5px] text-fg-faint">{result}</span>
      <Check size={11} className="ml-auto shrink-0 text-ok" />
    </div>
  );
}

function Copilot() {
  return (
    <section id="copilot" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-24">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <div>
          <p className="u-label !text-accent">Fig. 02 — Copilot</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-fg md:text-4xl">
            Tell it what you want.
            <br />
            Watch it draft.
          </h2>
          <p className="mt-5 max-w-md text-[14px] leading-relaxed text-fg-dim">
            The copilot sees your canvas and edits it through tool calls — adding
            services, wiring connections, tuning configs, arranging layout. It
            runs on <em className="not-italic text-fg">your</em> model: drop one
            API key in the environment and restart.
          </p>
          <pre className="mt-6 max-w-md rounded-[3px] border border-line bg-panel p-4 font-mono text-[11px] leading-relaxed text-fg-dim">
            <span className="text-fg-faint"># .env.local — pick one</span>
            {"\n"}ANTHROPIC_API_KEY=<span className="text-accent">sk-ant-…</span>
            {"\n"}OPENAI_API_KEY=<span className="text-accent">sk-…</span>
            {"\n"}GOOGLE_GENERATIVE_AI_API_KEY=<span className="text-accent">…</span>
            {"\n"}AI_GATEWAY_API_KEY=<span className="text-accent">…</span>
          </pre>
          <p className="mt-3 font-mono text-[9.5px] uppercase tracking-[0.14em] text-fg-faint">
            Keys stay server-side · the copilot edits the canvas, never your terminal
          </p>
        </div>

        {/* Chat transcript mock */}
        <div className="rounded-[4px] border border-line bg-panel p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
          <div className="mb-4 flex items-center gap-2 border-b border-line pb-3">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ok" />
            <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-fg-faint">
              anthropic · claude-sonnet-4-6
            </span>
          </div>
          <p className="u-label !text-amber">You</p>
          <p className="mt-1 text-[13px] text-fg">
            Make this event-driven — fan orders and alerts out through EventBridge.
          </p>
          <p className="u-label mt-5 !text-accent">Kloud</p>
          <div className="mt-2 space-y-1.5">
            <ChatChip icon={Plus} label="Add components" result="EventBridge bus, SQS queue, worker λ" />
            <ChatChip icon={Cable} label="Wire connections" result="4 links · rule: orders, rule: alerts" />
            <ChatChip icon={Waypoints} label="Arrange layout" result="left-to-right flow" />
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-fg">
            Routed the API through a domain bus — orders buffer through SQS into a
            worker, alerts fan out via SNS. The Terraform tab already has the rules.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ── Deploy ───────────────────────────────────────────────────────────── */

function Deploy() {
  const changes: [string, string, string][] = [
    ["ADD", "WorkerFn", "AWS::Lambda::Function"],
    ["ADD", "JobsQueue", "AWS::SQS::Queue"],
    ["ADD", "ItemsTable", "AWS::DynamoDB::Table"],
    ["MODIFY", "ApiHandler", "AWS::Lambda::Function"],
  ];
  return (
    <section id="deploy" className="scroll-mt-20 border-t border-line bg-panel/40">
      <div className="mx-auto max-w-6xl px-5 py-24">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          {/* Change-set mock */}
          <div className="order-2 rounded-[4px] border border-line bg-panel p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)] lg:order-1">
            <div className="mb-3 flex items-center gap-2 border-b border-line pb-3">
              <Rocket size={12} className="text-amber" />
              <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-fg-faint">
                change set · kloudarch-serverless-api
              </span>
            </div>
            <ul className="divide-y divide-line rounded-[3px] border border-line bg-ink">
              {changes.map(([action, id, type]) => (
                <li key={id} className="flex items-center gap-3 px-3 py-2 font-mono text-[10px]">
                  <span className={`w-12 shrink-0 ${action === "ADD" ? "text-ok" : "text-amber"}`}>
                    {action}
                  </span>
                  <span className="text-fg">{id}</span>
                  <span className="ml-auto truncate text-fg-faint">{type}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 space-y-1 font-mono text-[9.5px]">
              <p className="text-fg-faint">10:46:51 WorkerFn CREATE_IN_PROGRESS</p>
              <p className="text-fg-faint">10:47:12 WorkerFn <span className="text-ok">CREATE_COMPLETE</span></p>
              <p className="text-ok">10:47:40 kloudarch-serverless-api CREATE_COMPLETE</p>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
              <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-fg-faint">
                outputs: ApiEndpoint · BucketName
              </span>
              <span className="inline-flex h-8 items-center gap-1.5 rounded-[3px] bg-amber px-4 text-[11.5px] font-semibold text-ink">
                <Rocket size={12} />
                Deploy 4 changes
              </span>
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <p className="u-label !text-accent">Fig. 03 — Deploy</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-fg md:text-4xl">
              From sheet to stack.
            </h2>
            <p className="mt-5 max-w-md text-[14px] leading-relaxed text-fg-dim">
              Hit Deploy and the studio computes a CloudFormation change set —
              every add, modify and remove laid out for review before anything
              touches your account. Approve it, and AWS executes natively while
              stack events stream back live. Outputs land in the studio;
              teardown is one typed confirmation away.
            </p>
            <ul className="mt-6 max-w-md space-y-2 text-[12.5px] text-fg-dim">
              {[
                "Your AWS credentials, server-side env only — never in the browser",
                "Re-deploys diff against the existing stack, not from scratch",
                "Failing design checks gate the deploy until acknowledged",
                "Disabled by default on shared instances — self-hosting stays safe",
              ].map((line) => (
                <li key={line} className="flex items-start gap-2">
                  <Check size={13} className="mt-0.5 shrink-0 text-ok" />
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Open source CTA + footer ─────────────────────────────────────────── */

function OpenSource() {
  return (
    <section className="border-t border-line bg-panel/40">
      <div className="mx-auto max-w-6xl px-5 py-24 text-center">
        <div className="flex justify-center">
          <LogoMark size={72} detail />
        </div>
        <h2 className="mt-8 text-3xl font-bold tracking-tight text-fg md:text-4xl">
          Open source, open blueprint.
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-[14px] leading-relaxed text-fg-dim">
          KloudArch is MIT-licensed and built to be extended — adding a service
          is one catalog entry and one Terraform emitter. Star it, fork it,
          break it, PR it.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/studio"
            className="inline-flex h-11 items-center gap-2 rounded-[3px] bg-amber px-6 text-[14px] font-semibold text-ink transition-colors hover:bg-[#ffc452]"
          >
            Launch the Studio
            <ArrowRight size={15} />
          </Link>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="u-btn !h-11 !px-5 !text-[13px]">
            <GitHubIcon size={15} />
            View the source
          </a>
        </div>
        <p className="mt-10 font-mono text-[9.5px] uppercase tracking-[0.16em] text-fg-faint">
          Roadmap · more IaC backends · GCP + Azure catalogs · realtime collaboration
        </p>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 md:flex-row">
        <LogoLockup markSize={20} />
        <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-fg-faint">
          Built with Next.js · React Flow · AI SDK
        </p>
        <nav className="flex items-center gap-4 font-mono text-[9.5px] uppercase tracking-[0.12em] text-fg-faint">
          <Link href="/studio" className="transition-colors hover:text-fg">Studio</Link>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="transition-colors hover:text-fg">GitHub</a>
          <a href={`${GITHUB_URL}/blob/main/LICENSE`} target="_blank" rel="noreferrer" className="transition-colors hover:text-fg">MIT License</a>
        </nav>
      </div>
    </footer>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-ink">
      <Nav />
      <main>
        <Hero />
        <Stats />
        <Features />
        <Workflow />
        <Copilot />
        <Deploy />
        <OpenSource />
      </main>
      <Footer />
    </div>
  );
}
