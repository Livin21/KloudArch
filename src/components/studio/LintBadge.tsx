"use client";

import { Info, TriangleAlert } from "lucide-react";
import type { NodeLintBadge } from "@/lib/lint-cache";

/** Floating drafting marker on canvas cards that fail a design check. */
export default function LintBadge({ badge }: { badge: NodeLintBadge | null }) {
  if (!badge) return null;
  const warn = badge.severity === "warn";
  return (
    <span
      title={badge.messages.join("\n")}
      className={`absolute -right-2.5 -top-2.5 z-10 flex h-[18px] w-[18px] items-center justify-center rounded-[3px] border bg-ink ${
        warn
          ? "border-amber text-amber shadow-[0_0_10px_rgba(255,178,36,0.35)]"
          : "border-accent/50 text-accent"
      }`}
    >
      {warn ? <TriangleAlert size={10} strokeWidth={2.2} /> : <Info size={10} strokeWidth={2.2} />}
    </span>
  );
}
