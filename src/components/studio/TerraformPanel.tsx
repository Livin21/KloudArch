"use client";

import { Check, Copy, Download } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { generateCloudFormation } from "@/lib/cloudformation";
import { downloadText } from "@/lib/download";
import { useDesignStore } from "@/lib/store";
import { generateTerraform } from "@/lib/terraform";

const KEYWORD = /^(resource|variable|provider|output|data|terraform|module)$/;
const BUILTIN = /^(true|false|null|jsonencode|filebase64sha256|var|local)$/;

function highlightHclLine(line: string, key: number): ReactNode {
  if (/^\s*#/.test(line)) {
    return (
      <span key={key} className="italic text-fg-faint/80">
        {line}
      </span>
    );
  }
  const parts = line.split(/("(?:[^"\\]|\\.)*")/g);
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      return (
        <span key={`${key}-${i}`} className="text-[#e3c47e]">
          {part}
        </span>
      );
    }
    return part.split(/\b([a-z_0-9]+)\b/g).map((token, j) => {
      if (KEYWORD.test(token)) {
        return (
          <span key={`${key}-${i}-${j}`} className="text-[#a78bfa]">
            {token}
          </span>
        );
      }
      if (BUILTIN.test(token)) {
        return (
          <span key={`${key}-${i}-${j}`} className="text-accent/90">
            {token}
          </span>
        );
      }
      return <span key={`${key}-${i}-${j}`}>{token}</span>;
    });
  });
}

function highlightJsonLine(line: string, key: number): ReactNode {
  const parts = line.split(/("(?:[^"\\]|\\.)*")/g);
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      // Quoted segment — keys (followed by a colon) read violet, values amber.
      const rest = parts.slice(i + 1).join("");
      const isKey = /^\s*:/.test(rest);
      return (
        <span key={`${key}-${i}`} className={isKey ? "text-[#a78bfa]" : "text-[#e3c47e]"}>
          {part}
        </span>
      );
    }
    return part.split(/\b(true|false|null|\d+)\b/g).map((token, j) =>
      /^(true|false|null|\d+)$/.test(token) ? (
        <span key={`${key}-${i}-${j}`} className="text-accent/90">
          {token}
        </span>
      ) : (
        <span key={`${key}-${i}-${j}`}>{token}</span>
      ),
    );
  });
}

type Format = "tf" | "cfn";

const FORMATS: { id: Format; label: string; filename: string }[] = [
  { id: "tf", label: "main.tf", filename: "main.tf" },
  { id: "cfn", label: "template.json", filename: "template.json" },
];

export default function TerraformPanel() {
  const nodes = useDesignStore((s) => s.nodes);
  const edges = useDesignStore((s) => s.edges);
  const projectName = useDesignStore((s) => s.projectName);
  const region = useDesignStore((s) => s.region);
  const [format, setFormat] = useState<Format>("tf");
  const [copied, setCopied] = useState(false);

  const code = useMemo(() => {
    const input = { projectName, region, nodes, edges };
    return format === "tf" ? generateTerraform(input) : generateCloudFormation(input);
  }, [format, projectName, region, nodes, edges]);

  const lines = useMemo(() => code.split("\n"), [code]);
  const resourceCount = useMemo(
    () =>
      format === "tf"
        ? (code.match(/^resource "/gm) ?? []).length
        : (code.match(/"Type": "AWS::/g) ?? []).length,
    [code, format],
  );
  const filename = FORMATS.find((f) => f.id === format)!.filename;

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-line px-3 py-2">
        {FORMATS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFormat(f.id)}
            className={`rounded-[2px] border px-2 py-1 font-mono text-[10px] transition-colors ${
              format === f.id
                ? "border-accent/50 bg-accent/10 text-accent"
                : "border-line text-fg-faint hover:text-fg-dim"
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="rounded-[2px] border border-line px-1.5 py-0.5 font-mono text-[8.5px] tracking-[0.1em] text-fg-faint">
          LIVE
        </span>
        <div className="flex-1" />
        <button className="u-btn !h-7 !px-2" onClick={copy} title="Copy to clipboard">
          {copied ? <Check size={12} className="text-ok" /> : <Copy size={12} />}
        </button>
        <button
          className="u-btn !h-7 !px-2"
          onClick={() => downloadText(filename, code, format === "cfn" ? "application/json" : "text/plain")}
          title={`Download ${filename}`}
        >
          <Download size={12} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-ink">
        <pre className="py-3 font-mono text-[10.5px] leading-[1.6]">
          {lines.map((line, i) => (
            <div key={`${format}-${i}`} className="flex hover:bg-panel/60">
              <span className="w-10 shrink-0 select-none pr-3 text-right text-fg-faint/50">
                {i + 1}
              </span>
              <span className="flex-1 whitespace-pre pr-4 text-fg-dim">
                {format === "tf" ? highlightHclLine(line, i) : highlightJsonLine(line, i)}
              </span>
            </div>
          ))}
        </pre>
      </div>

      <div className="shrink-0 border-t border-line px-3 py-2">
        <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-fg-faint">
          {resourceCount} resources ·{" "}
          {format === "tf" ? "terraform init → plan → apply" : "deploys from the studio via change sets"}
        </p>
      </div>
    </div>
  );
}
