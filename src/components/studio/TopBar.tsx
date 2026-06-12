"use client";

import {
  ChevronDown,
  Download,
  FileCode2,
  FileJson,
  LayoutTemplate,
  Redo2,
  Rocket,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  Waypoints,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LogoLockup } from "@/components/Logo";
import { generateCloudFormation } from "@/lib/cloudformation";
import { downloadText } from "@/lib/download";
import { serializeProject, useDesignStore } from "@/lib/store";
import { generateTerraform } from "@/lib/terraform";

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "design";
}

export default function TopBar() {
  const projectName = useDesignStore((s) => s.projectName);
  const setProjectName = useDesignStore((s) => s.setProjectName);
  const undo = useDesignStore((s) => s.undo);
  const redo = useDesignStore((s) => s.redo);
  const canUndo = useDesignStore((s) => s.past.length > 0);
  const canRedo = useDesignStore((s) => s.future.length > 0);
  const arrange = useDesignStore((s) => s.arrange);
  const clearAll = useDesignStore((s) => s.clearAll);
  const nodeCount = useDesignStore((s) => s.nodes.length);
  const setTemplatesOpen = useDesignStore((s) => s.setTemplatesOpen);
  const setDeployOpen = useDesignStore((s) => s.setDeployOpen);
  const setDockTab = useDesignStore((s) => s.setDockTab);

  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!exportOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!exportRef.current?.contains(e.target as Node)) setExportOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [exportOpen]);

  const exportJson = () => {
    downloadText(
      `${slugify(projectName)}.kloudarch.json`,
      JSON.stringify(serializeProject(), null, 2),
      "application/json",
    );
    setExportOpen(false);
  };

  const exportTerraform = () => {
    const file = serializeProject();
    downloadText("main.tf", generateTerraform(file));
    setExportOpen(false);
  };

  const exportCloudFormation = () => {
    const file = serializeProject();
    downloadText("template.json", generateCloudFormation(file), "application/json");
    setExportOpen(false);
  };

  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const { importProject } = await import("@/lib/store");
    const result = importProject(await file.text());
    if (!result.ok) window.alert(result.error ?? "Import failed.");
  };

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-panel px-3">
      {/* Wordmark */}
      <Link href="/" className="pr-1" title="KloudArch home">
        <LogoLockup markSize={24} tag="STUDIO 0.2" />
      </Link>

      <span className="h-5 w-px bg-line" />

      {/* Project name */}
      <input
        key={projectName === "Untitled Architecture" ? "fresh" : "named"}
        className="h-8 w-56 rounded-[3px] border border-transparent bg-transparent px-2 text-[13px] font-medium text-fg outline-none transition-colors hover:border-line focus:border-accent"
        defaultValue={projectName}
        onBlur={(e) => setProjectName(e.target.value.trim() || "Untitled Architecture")}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        title="Project name"
        aria-label="Project name"
      />

      <button className="u-btn" onClick={() => setTemplatesOpen(true)}>
        <LayoutTemplate size={13} />
        Templates
      </button>

      <div className="flex-1" />

      {/* Edit controls */}
      <div className="flex items-center gap-1.5">
        <button className="u-btn !px-2" onClick={undo} disabled={!canUndo} title="Undo (⌘Z)">
          <Undo2 size={14} />
        </button>
        <button className="u-btn !px-2" onClick={redo} disabled={!canRedo} title="Redo (⇧⌘Z)">
          <Redo2 size={14} />
        </button>
        <button className="u-btn !px-2" onClick={arrange} disabled={nodeCount === 0} title="Auto-arrange layout">
          <Waypoints size={14} />
        </button>
        <button
          className="u-btn !px-2 hover:!border-danger/50 hover:!text-danger"
          onClick={() => {
            if (nodeCount === 0) return;
            if (window.confirm("Clear the entire canvas? You can undo this.")) clearAll();
          }}
          disabled={nodeCount === 0}
          title="Clear canvas"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <span className="h-5 w-px bg-line" />

      {/* IO */}
      <div className="flex items-center gap-1.5">
        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={onImportFile} />
        <button className="u-btn !px-2" onClick={() => fileRef.current?.click()} title="Import design JSON">
          <Upload size={14} />
        </button>
        <div className="relative" ref={exportRef}>
          <button className="u-btn" onClick={() => setExportOpen((v) => !v)} title="Export">
            <Download size={14} />
            Export
            <ChevronDown size={12} className={`transition-transform ${exportOpen ? "rotate-180" : ""}`} />
          </button>
          {exportOpen && (
            <div className="absolute right-0 top-[34px] z-50 w-52 rounded-[3px] border border-line bg-raised py-1 shadow-[0_12px_32px_rgba(0,0,0,0.5)]">
              <button
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12.5px] text-fg-dim hover:bg-panel hover:text-fg"
                onClick={exportTerraform}
              >
                <FileCode2 size={14} className="text-accent" />
                <span>
                  Terraform
                  <span className="block font-mono text-[9px] text-fg-faint">main.tf</span>
                </span>
              </button>
              <button
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12.5px] text-fg-dim hover:bg-panel hover:text-fg"
                onClick={exportCloudFormation}
              >
                <FileCode2 size={14} className="text-accent" />
                <span>
                  CloudFormation
                  <span className="block font-mono text-[9px] text-fg-faint">template.json</span>
                </span>
              </button>
              <button
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12.5px] text-fg-dim hover:bg-panel hover:text-fg"
                onClick={exportJson}
              >
                <FileJson size={14} className="text-accent" />
                <span>
                  Design file
                  <span className="block font-mono text-[9px] text-fg-faint">
                    {slugify(projectName)}.kloudarch.json
                  </span>
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      <span className="h-5 w-px bg-line" />

      <button
        className="u-btn !border-accent/40 !text-accent hover:!bg-accent/10"
        onClick={() => setDockTab("chat")}
        title="Open AI assistant (⌘K)"
      >
        <Sparkles size={13} />
        Assistant
      </button>
      <button
        className="u-btn !border-amber/50 !bg-amber/10 !text-amber hover:!bg-amber/20"
        onClick={() => setDeployOpen(true)}
        title="Deploy"
      >
        <Rocket size={13} />
        Deploy
      </button>
    </header>
  );
}
