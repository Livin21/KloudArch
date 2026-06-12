"use client";

import { FileCode2, Rocket, X } from "lucide-react";
import { useEffect } from "react";
import { serializeProject, useDesignStore } from "@/lib/store";
import { generateTerraform } from "@/lib/terraform";

export default function DeployModal() {
  const open = useDesignStore((s) => s.deployOpen);
  const setOpen = useDesignStore((s) => s.setDeployOpen);

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, setOpen]);

  if (!open) return null;

  const downloadTf = () => {
    const code = generateTerraform(serializeProject());
    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "main.tf";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-[2px]"
      onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
    >
      <div className="w-[480px] border border-line bg-panel shadow-[0_24px_80px_rgba(0,0,0,0.6)]">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <Rocket size={15} className="text-amber" />
            <h2 className="text-[14px] font-semibold tracking-wide text-fg">Deploy</h2>
            <span className="rounded-[2px] border border-amber/40 bg-amber/10 px-1.5 py-0.5 font-mono text-[8.5px] tracking-[0.12em] text-amber">
              ROADMAP v0.2
            </span>
          </div>
          <button className="u-btn !h-8 !px-2" onClick={() => setOpen(false)} title="Close">
            <X size={14} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <p className="text-[12.5px] leading-relaxed text-fg-dim">
            One-click deployment from the studio is on the roadmap for v0.2. Until
            then, your design is already deployable — export the generated
            Terraform and apply it with your own AWS credentials:
          </p>
          <pre className="rounded-[3px] border border-line bg-ink p-3.5 font-mono text-[11px] leading-relaxed text-fg-dim">
            <span className="text-fg-faint"># with AWS credentials configured</span>
            {"\nterraform init\nterraform plan   "}
            <span className="text-fg-faint"># review carefully</span>
            {"\nterraform apply"}
          </pre>
          <button className="u-btn w-full justify-center !border-accent/40 !text-accent hover:!bg-accent/10" onClick={downloadTf}>
            <FileCode2 size={13} />
            Download main.tf
          </button>
        </div>
      </div>
    </div>
  );
}
