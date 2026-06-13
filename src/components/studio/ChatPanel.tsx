"use client";

import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithToolCalls,
  type DynamicToolUIPart,
  type ToolUIPart,
} from "ai";
import {
  ArrowUp,
  Cable,
  Check,
  CircleStop,
  Eraser,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { designSnapshot, executeDesignTool } from "@/lib/ai-bridge";

const TOOL_META: Record<string, { icon: LucideIcon; label: string }> = {
  add_nodes: { icon: Plus, label: "Add components" },
  connect_nodes: { icon: Cable, label: "Wire connections" },
  update_node: { icon: Pencil, label: "Update component" },
  remove_nodes: { icon: Trash2, label: "Remove components" },
  clear_canvas: { icon: Eraser, label: "Clear canvas" },
  arrange_layout: { icon: Waypoints, label: "Arrange layout" },
};

const SUGGESTIONS = [
  "Design a serverless REST API with auth and a jobs queue",
  "Create a 3-tier web app inside a VPC",
  "Add a Redis cache between the app and the database",
  "Make this design event-driven with EventBridge",
];

function ToolChip({ part }: { part: ToolUIPart | DynamicToolUIPart }) {
  const toolName =
    part.type === "dynamic-tool" ? part.toolName : part.type.replace(/^tool-/, "");
  const meta = TOOL_META[toolName] ?? { icon: Sparkles, label: toolName };
  const Icon = meta.icon;
  const done = part.state === "output-available";
  const summary =
    done && typeof part.output === "string" ? part.output.split("\n")[0] : null;

  return (
    <div className="my-1.5 flex items-start gap-2 rounded-[3px] border border-line bg-ink px-2.5 py-1.5">
      <Icon size={12} className="mt-0.5 shrink-0 text-accent" />
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-fg-dim">
          {meta.label}
        </p>
        {summary && (
          <p className="mt-0.5 truncate font-mono text-[9.5px] text-fg-faint" title={summary}>
            {summary}
          </p>
        )}
      </div>
      {done ? (
        <Check size={12} className="mt-0.5 shrink-0 text-ok" />
      ) : (
        <Loader2 size={12} className="mt-0.5 shrink-0 animate-spin text-fg-faint" />
      )}
    </div>
  );
}

type ProviderMeta =
  | { configured: false; disabled?: boolean }
  | { configured: true; provider: string; model: string };

export default function ChatPanel() {
  const [input, setInput] = useState("");
  const [meta, setMeta] = useState<ProviderMeta | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest({ messages, id }) {
          return { body: { messages, id, design: designSnapshot() } };
        },
      }),
    [],
  );

  const { messages, sendMessage, addToolOutput, status, stop, error } = useChat({
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onToolCall({ toolCall }) {
      if (toolCall.dynamic) return;
      const output = executeDesignTool(toolCall.toolName, toolCall.input);
      // No await — per AI SDK docs, awaiting here can deadlock.
      addToolOutput({
        tool: toolCall.toolName,
        toolCallId: toolCall.toolCallId,
        output,
      });
    },
  });

  useEffect(() => {
    fetch("/api/chat")
      .then((r) => r.json())
      .then(setMeta)
      .catch(() => setMeta({ configured: false }));
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  const busy = status === "submitted" || status === "streaming";

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy || meta?.configured === false) return;
    sendMessage({ text: trimmed });
    setInput("");
  };

  return (
    <div className="flex h-full flex-col">
      {/* Provider status */}
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${
            meta === null
              ? "bg-fg-faint"
              : meta.configured
                ? "animate-pulse bg-ok"
                : meta.disabled
                  ? "bg-accent"
                  : "bg-danger"
          }`}
        />
        <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-fg-faint">
          {meta === null
            ? "checking model…"
            : meta.configured
              ? `${meta.provider} · ${meta.model}`
              : meta.disabled
                ? "demo · copilot off by design"
                : "no model configured"}
        </span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3.5">
        {meta?.configured === false && meta.disabled && (
          <div className="rounded-[3px] border border-accent/30 bg-accent/5 p-3.5">
            <p className="u-label mb-2 !text-accent">Copilot runs on your own key</p>
            <p className="text-[11.5px] leading-relaxed text-fg-dim">
              On this public demo the AI copilot is off by design — a shared site
              can&apos;t spend anyone&apos;s API credits. Everything else is fully
              live: design on the canvas, start from a template, and watch
              Terraform <span className="text-fg">&amp;</span> CloudFormation
              generate as you build.
            </p>
            <p className="mt-2.5 text-[11.5px] leading-relaxed text-fg-dim">
              Run it locally to chat with the copilot — bring an Anthropic,
              OpenAI or Google key:
            </p>
            <pre className="mt-2 overflow-x-auto rounded-[2px] border border-line bg-ink p-2.5 font-mono text-[10px] leading-relaxed text-fg-dim">
              {"git clone github.com/Livin21/KloudArch.git\ncp .env.example .env.local   # add your key\nnpm install && npm run dev"}
            </pre>
            <a
              href="https://github.com/Livin21/KloudArch#enable-the-ai-copilot"
              target="_blank"
              rel="noreferrer"
              className="u-btn mt-3 w-full justify-center !border-accent/40 !text-accent hover:!bg-accent/10 !text-[11.5px]"
            >
              Self-host from GitHub →
            </a>
          </div>
        )}

        {meta?.configured === false && !meta.disabled && (
          <div className="rounded-[3px] border border-amber/40 bg-amber/5 p-3.5">
            <p className="u-label mb-2 !text-amber">Bring your own model</p>
            <p className="text-[11.5px] leading-relaxed text-fg-dim">
              The assistant is powered by your own API key. Create{" "}
              <code className="font-mono text-accent">.env.local</code> in the project
              root with one of:
            </p>
            <pre className="mt-2 rounded-[2px] border border-line bg-ink p-2.5 font-mono text-[10px] leading-relaxed text-fg-dim">
              {"ANTHROPIC_API_KEY=sk-ant-…\n# or OPENAI_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY\n# or AI_GATEWAY_API_KEY"}
            </pre>
            <p className="mt-2 text-[11.5px] text-fg-faint">
              Then restart <code className="font-mono">npm run dev</code>.
            </p>
          </div>
        )}

        {messages.length === 0 && meta?.configured !== false && (
          <div className="pt-2">
            <p className="u-label mb-1.5 !text-accent">Design copilot</p>
            <p className="text-[12px] leading-relaxed text-fg-dim">
              Describe an architecture and I&apos;ll draft it on the canvas — or ask me
              to extend, rewire, or clean up what&apos;s already there.
            </p>
            <div className="mt-4 space-y-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => submit(s)}
                  className="block w-full rounded-[3px] border border-line bg-ink px-3 py-2 text-left text-[11.5px] text-fg-dim transition-colors hover:border-accent/50 hover:text-fg"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div key={message.id}>
            <p
              className={`u-label mb-1 ${
                message.role === "user" ? "!text-amber" : "!text-accent"
              }`}
            >
              {message.role === "user" ? "You" : "Kloud"}
            </p>
            <div className="text-[12.5px] leading-relaxed text-fg">
              {message.parts.map((part, i) => {
                if (part.type === "text") {
                  return (
                    <p key={i} className="whitespace-pre-wrap">
                      {part.text}
                    </p>
                  );
                }
                if (isToolUIPart(part)) {
                  return <ToolChip key={part.toolCallId} part={part} />;
                }
                return null;
              })}
            </div>
          </div>
        ))}

        {status === "submitted" && (
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">
            drafting<span className="animate-pulse">▍</span>
          </p>
        )}

        {error && (
          <div className="rounded-[3px] border border-danger/40 bg-danger/5 px-3 py-2 text-[11.5px] text-danger">
            {error.message || "Something went wrong — try again."}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-line p-3">
        <div className="flex items-end gap-2 rounded-[3px] border border-line bg-ink p-2 transition-colors focus-within:border-accent">
          <textarea
            rows={2}
            className="max-h-32 min-h-[40px] flex-1 resize-none bg-transparent px-1 text-[12.5px] text-fg outline-none placeholder:text-fg-faint"
            placeholder={
              meta?.configured === false
                ? meta.disabled
                  ? "copilot disabled — self-host to enable…"
                  : "configure an API key to chat…"
                : "describe a change to the design…"
            }
            value={input}
            disabled={meta?.configured === false}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(input);
              }
            }}
          />
          {busy ? (
            <button
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[3px] border border-line text-fg-dim transition-colors hover:border-danger/50 hover:text-danger"
              onClick={() => stop()}
              title="Stop"
            >
              <CircleStop size={14} />
            </button>
          ) : (
            <button
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[3px] bg-accent/15 text-accent transition-colors hover:bg-accent/25 disabled:opacity-30"
              onClick={() => submit(input)}
              disabled={!input.trim() || meta?.configured === false}
              title="Send (Enter)"
            >
              <ArrowUp size={14} />
            </button>
          )}
        </div>
        <p className="mt-1.5 text-center font-mono text-[8.5px] uppercase tracking-[0.12em] text-fg-faint">
          the copilot edits your canvas with tools · review before deploying
        </p>
      </div>
    </div>
  );
}
