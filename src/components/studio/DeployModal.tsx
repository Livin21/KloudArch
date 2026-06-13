"use client";

import {
  ArrowRight,
  Check,
  ExternalLink,
  FileCode2,
  KeyRound,
  Loader2,
  Rocket,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cfnDeployWarnings, generateCloudFormation } from "@/lib/cloudformation";
import { downloadText } from "@/lib/download";
import { getLints } from "@/lib/lint-cache";
import { serializeProject, useDesignStore } from "@/lib/store";
import { generateTerraform } from "@/lib/terraform";

type Phase =
  | "loading"
  | "disabled"
  | "unconfigured"
  | "password"
  | "preflight"
  | "creating"
  | "review"
  | "no_changes"
  | "deploying"
  | "deployed"
  | "deleting"
  | "deleted"
  | "failed";

type Meta = {
  account: string;
  region: string;
  stackName: string;
  stack: { exists: boolean; status?: string; consoleUrl?: string };
};

type Change = { action: string; logicalId: string; resourceType: string; replacement?: string };
type StackEvent = { at: number; logicalId: string; resourceType: string; status: string; reason?: string };
type Output = { key: string; value: string; description: string };

const ACTION_COLOR: Record<string, string> = {
  Add: "text-ok",
  Modify: "text-amber",
  Remove: "text-danger",
  Dynamic: "text-fg-dim",
};

function eventColor(status: string) {
  if (status.includes("FAILED") || status.includes("ROLLBACK")) return "text-danger";
  if (status.endsWith("_COMPLETE")) return "text-ok";
  return "text-fg-dim";
}

export default function DeployModal() {
  const open = useDesignStore((s) => s.deployOpen);
  const setOpen = useDesignStore((s) => s.setDeployOpen);
  const nodes = useDesignStore((s) => s.nodes);
  const edges = useDesignStore((s) => s.edges);
  const projectName = useDesignStore((s) => s.projectName);
  const region = useDesignStore((s) => s.region);

  const [phase, setPhase] = useState<Phase>("loading");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [changeSet, setChangeSet] = useState<{ id: string; type: string } | null>(null);
  const [changes, setChanges] = useState<Change[]>([]);
  const [events, setEvents] = useState<StackEvent[]>([]);
  const [outputs, setOutputs] = useState<Output[] | null>(null);
  const [stackUrl, setStackUrl] = useState<string | null>(null);
  const [ackWarnings, setAckWarnings] = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);
  const [teardownInput, setTeardownInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");

  const sinceRef = useRef(0);
  const passwordRef = useRef("");
  const logRef = useRef<HTMLDivElement>(null);

  const authHeaders = (): Record<string, string> =>
    passwordRef.current ? { "x-deploy-password": passwordRef.current } : {};

  const lints = useMemo(() => getLints(nodes, edges), [nodes, edges]);
  const warnLints = lints.filter((l) => l.severity === "warn");
  const cfnWarnings = useMemo(
    () => cfnDeployWarnings({ projectName, region, nodes, edges }),
    [projectName, region, nodes, edges],
  );
  const template = useMemo(
    () => (open ? generateCloudFormation({ projectName, region, nodes, edges }) : ""),
    [open, projectName, region, nodes, edges],
  );

  const reset = useCallback(() => {
    setPhase("loading");
    setMeta(null);
    setError(null);
    setChangeSet(null);
    setChanges([]);
    setEvents([]);
    setOutputs(null);
    setStackUrl(null);
    setAckWarnings(false);
    setShowTemplate(false);
    setTeardownInput("");
  }, []);

  const loadMeta = useCallback(async () => {
    reset();
    if (!passwordRef.current) {
      passwordRef.current = window.sessionStorage.getItem("kloudarch:deploy-password") ?? "";
    }
    try {
      const res = await fetch(
        `/api/deploy?project=${encodeURIComponent(projectName)}&region=${encodeURIComponent(region)}`,
        { headers: authHeaders() },
      );
      const data = await res.json();
      if (data.disabled) setPhase("disabled");
      else if (data.configured === false) setPhase("unconfigured");
      else if (data.passwordRequired) {
        if (data.error) setError(data.error);
        setPhase("password");
      } else if (data.error) {
        setError(data.error);
        setPhase("failed");
      } else {
        setMeta(data);
        setPhase("preflight");
      }
    } catch {
      setError("Could not reach the deploy API.");
      setPhase("failed");
    }
  }, [projectName, region, reset]);

  const submitPassword = () => {
    const value = passwordInput.trim();
    if (!value) return;
    passwordRef.current = value;
    window.sessionStorage.setItem("kloudarch:deploy-password", value);
    setPasswordInput("");
    loadMeta();
  };

  // Load deploy status whenever the modal opens. The synchronous state reset
  // inside loadMeta is deliberate — fresh modal session, single render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) loadMeta();
  }, [open, loadMeta]);

  // Escape closes (except mid-operation).
  useEffect(() => {
    if (!open) return;
    const busy = phase === "creating" || phase === "deploying" || phase === "deleting";
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && !busy && setOpen(false);
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, phase, setOpen]);

  // Poll loop for the three async phases.
  useEffect(() => {
    if (!open) return;
    if (phase !== "creating" && phase !== "deploying" && phase !== "deleting") return;

    const tick = async () => {
      try {
        if (phase === "creating" && meta && changeSet) {
          const res = await fetch(
            `/api/deploy/changeset?stack=${meta.stackName}&id=${encodeURIComponent(changeSet.id)}&region=${meta.region}`,
            { headers: authHeaders() },
          );
          const data = await res.json();
          if (data.error) {
            setError(data.error);
            setPhase("failed");
          } else if (data.status === "CREATE_COMPLETE") {
            setChanges(data.changes);
            setPhase("review");
          } else if (data.status === "FAILED") {
            if (data.noChanges) {
              // Clean up the empty change set quietly.
              fetch("/api/deploy/changeset", {
                method: "DELETE",
                headers: { "content-type": "application/json", ...authHeaders() },
                body: JSON.stringify({ stack: meta.stackName, id: changeSet.id, region: meta.region }),
              }).catch(() => {});
              setPhase("no_changes");
            } else {
              setError(data.reason ?? "Change set creation failed.");
              setPhase("failed");
            }
          }
        } else if ((phase === "deploying" || phase === "deleting") && meta) {
          const res = await fetch(
            `/api/deploy/stack?name=${meta.stackName}&region=${meta.region}&since=${sinceRef.current}`,
            { headers: authHeaders() },
          );
          const data = await res.json();
          if (data.error) {
            setError(data.error);
            setPhase("failed");
            return;
          }
          if (data.events?.length) {
            setEvents((prev) => [...prev, ...data.events]);
            sinceRef.current = data.events[data.events.length - 1].at;
          }
          if (data.consoleUrl) setStackUrl(data.consoleUrl);
          const status: string = data.status ?? "";
          if (phase === "deleting") {
            if (status === "DELETE_COMPLETE") setPhase("deleted");
            else if (status === "DELETE_FAILED") {
              setError("Stack deletion failed — some resources may need manual cleanup in the AWS console.");
              setPhase("failed");
            }
          } else {
            if (status === "CREATE_COMPLETE" || status === "UPDATE_COMPLETE") {
              setOutputs(data.outputs ?? []);
              setPhase("deployed");
            } else if (
              status.includes("ROLLBACK_COMPLETE") ||
              status === "CREATE_FAILED" ||
              status === "UPDATE_FAILED"
            ) {
              setError("Deployment failed and rolled back — the event log below shows the cause.");
              setPhase("failed");
            }
          }
        }
      } catch {
        // transient network error — keep polling
      }
    };

    tick();
    const interval = setInterval(tick, 2500);
    return () => clearInterval(interval);
  }, [open, phase, meta, changeSet]);

  // Autoscroll the event log.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events]);

  if (!open) return null;

  const busy = phase === "creating" || phase === "deploying" || phase === "deleting";
  const design = () => {
    const file = serializeProject();
    return { projectName: file.projectName, region: file.region, nodes: file.nodes, edges: file.edges };
  };

  const startChangeSet = async () => {
    setPhase("creating");
    setError(null);
    try {
      const res = await fetch("/api/deploy/changeset", {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify({ design: design() }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setPhase("failed");
      } else {
        setChangeSet({ id: data.changeSetId, type: data.changeSetType });
      }
    } catch {
      setError("Could not reach the deploy API.");
      setPhase("failed");
    }
  };

  const execute = async () => {
    if (!meta || !changeSet) return;
    setEvents([]);
    setError(null);
    const res = await fetch("/api/deploy/changeset/execute", {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify({ stack: meta.stackName, id: changeSet.id, region: meta.region }),
    });
    const data = await res.json();
    if (data.error) {
      setError(data.error);
      setPhase("failed");
      return;
    }
    sinceRef.current = (data.startedAt ?? Date.now()) - 5000;
    setPhase("deploying");
  };

  const discard = async () => {
    if (!meta || !changeSet) return;
    await fetch("/api/deploy/changeset", {
      method: "DELETE",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify({ stack: meta.stackName, id: changeSet.id, region: meta.region }),
    }).catch(() => {});
    setChangeSet(null);
    setChanges([]);
    setPhase("preflight");
  };

  const teardown = async () => {
    if (!meta) return;
    setEvents([]);
    setError(null);
    const res = await fetch("/api/deploy/stack", {
      method: "DELETE",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify({ name: meta.stackName, region: meta.region }),
    });
    const data = await res.json();
    if (data.error) {
      setError(data.error);
      setPhase("failed");
      return;
    }
    sinceRef.current = (data.startedAt ?? Date.now()) - 5000;
    setPhase("deleting");
  };

  const gateOpen = warnLints.length === 0 || ackWarnings;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-[2px]"
      onMouseDown={(e) => e.target === e.currentTarget && !busy && setOpen(false)}
    >
      <div className="flex max-h-[88vh] w-[660px] flex-col border border-line bg-panel shadow-[0_24px_80px_rgba(0,0,0,0.6)]">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <Rocket size={15} className="text-amber" />
            <h2 className="text-[14px] font-semibold tracking-wide text-fg">Deploy</h2>
            <span className="rounded-[2px] border border-line px-1.5 py-0.5 font-mono text-[8.5px] tracking-[0.12em] text-fg-faint">
              CLOUDFORMATION
            </span>
            {meta && (
              <span className="font-mono text-[9px] tracking-[0.1em] text-fg-faint">
                {meta.account} · {meta.region}
              </span>
            )}
          </div>
          <button className="u-btn !h-8 !px-2" onClick={() => !busy && setOpen(false)} disabled={busy} title="Close">
            <X size={14} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {phase === "loading" && (
            <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">
              <Loader2 size={12} className="animate-spin" /> checking aws credentials…
            </p>
          )}

          {phase === "disabled" && (
            <div className="rounded-[3px] border border-accent/30 bg-accent/5 p-4">
              <p className="u-label mb-2 !text-accent">Deploy runs on your own account</p>
              <p className="text-[12px] leading-relaxed text-fg-dim">
                On this public demo deployments are off by design — they&apos;d run
                against someone else&apos;s AWS account. Two ways to ship this design
                for real:
              </p>
              <ul className="mt-2.5 space-y-1.5 text-[12px] leading-relaxed text-fg-dim">
                <li className="flex gap-2">
                  <span className="text-accent">1.</span>
                  Export <span className="font-mono text-fg">template.json</span> or{" "}
                  <span className="font-mono text-fg">main.tf</span> below and apply it
                  with your own tooling.
                </li>
                <li className="flex gap-2">
                  <span className="text-accent">2.</span>
                  Self-host KloudArch with your AWS credentials to deploy and tear down
                  straight from the studio.
                </li>
              </ul>
              <a
                href="https://github.com/Livin21/KloudArch#enable-deploy-from-studio"
                target="_blank"
                rel="noreferrer"
                className="u-btn mt-3 w-full justify-center !border-accent/40 !text-accent hover:!bg-accent/10 !text-[11.5px]"
              >
                Self-host from GitHub →
              </a>
            </div>
          )}

          {phase === "unconfigured" && (
            <div className="rounded-[3px] border border-amber/40 bg-amber/5 p-4">
              <p className="u-label mb-2 !text-amber">Bring your own AWS account</p>
              <p className="text-[12px] leading-relaxed text-fg-dim">
                The studio deploys via CloudFormation using credentials from your environment.
                Add to <code className="font-mono text-accent">.env.local</code> and restart:
              </p>
              <pre className="mt-2 rounded-[2px] border border-line bg-ink p-2.5 font-mono text-[10px] leading-relaxed text-fg-dim">
                {"AWS_ACCESS_KEY_ID=AKIA…\nAWS_SECRET_ACCESS_KEY=…"}
              </pre>
              <p className="mt-2 text-[11px] leading-relaxed text-fg-faint">
                These credentials can create and destroy real infrastructure — use a sandbox
                account, and never expose a deploy-enabled instance publicly.
              </p>
            </div>
          )}

          {phase === "password" && (
            <div className="rounded-[3px] border border-line bg-ink p-4">
              <p className="u-label mb-2 flex items-center gap-1.5">
                <KeyRound size={11} className="text-amber" />
                Deploy password required
              </p>
              <p className="text-[12px] leading-relaxed text-fg-dim">
                This instance protects deployments with a shared secret
                (<code className="font-mono text-accent">DEPLOY_PASSWORD</code>).
                Enter it to continue — it&apos;s kept for this browser session only.
              </p>
              <div className="mt-3 flex gap-2">
                <input
                  type="password"
                  className="u-input !h-9 flex-1 font-mono !text-[12px]"
                  placeholder="deploy password…"
                  value={passwordInput}
                  autoFocus
                  onChange={(e) => setPasswordInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitPassword()}
                />
                <button
                  className="inline-flex h-9 items-center gap-1.5 rounded-[3px] bg-amber px-4 text-[12.5px] font-semibold text-ink transition-colors hover:bg-[#ffc452] disabled:opacity-40"
                  onClick={submitPassword}
                  disabled={!passwordInput.trim()}
                >
                  Unlock
                </button>
              </div>
            </div>
          )}

          {phase === "preflight" && meta && (
            <>
              <div className="rounded-[3px] border border-line bg-ink p-3.5">
                <div className="flex items-center justify-between">
                  <span className="u-label">Stack</span>
                  <span className="font-mono text-[10px] text-fg-dim">{meta.stackName}</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="u-label">Status</span>
                  <span className="font-mono text-[10px] text-fg-dim">
                    {meta.stack.exists ? meta.stack.status : "NOT DEPLOYED YET"}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="u-label">Resources in design</span>
                  <span className="font-mono text-[10px] text-fg-dim">
                    {(template.match(/"Type": "AWS::/g) ?? []).length}
                  </span>
                </div>
              </div>

              {warnLints.length > 0 && (
                <div className="rounded-[3px] border border-amber/40 bg-amber/5 p-3.5">
                  <p className="u-label mb-2 !text-amber">
                    <TriangleAlert size={10} className="mr-1 inline" />
                    {warnLints.length} design check{warnLints.length > 1 ? "s" : ""} failing
                  </p>
                  <ul className="space-y-1 text-[11px] leading-snug text-fg-dim">
                    {warnLints.map((l) => (
                      <li key={l.id}>· {l.message}</li>
                    ))}
                  </ul>
                  <label className="mt-3 flex cursor-pointer items-center gap-2 text-[11.5px] text-fg">
                    <input
                      type="checkbox"
                      checked={ackWarnings}
                      onChange={(e) => setAckWarnings(e.target.checked)}
                      className="accent-[#ffb224]"
                    />
                    Deploy anyway — these will likely fail or misconfigure resources
                  </label>
                </div>
              )}

              {cfnWarnings.length > 0 && (
                <div className="rounded-[3px] border border-line bg-ink p-3.5">
                  <p className="u-label mb-2">Deploy notes</p>
                  <ul className="space-y-1 text-[11px] leading-snug text-fg-dim">
                    {cfnWarnings.map((w, i) => (
                      <li key={i}>· {w}</li>
                    ))}
                  </ul>
                </div>
              )}

              <button
                className="font-mono text-[10px] uppercase tracking-[0.12em] text-fg-faint transition-colors hover:text-accent"
                onClick={() => setShowTemplate((v) => !v)}
              >
                {showTemplate ? "▾ hide" : "▸ view"} template.json
              </button>
              {showTemplate && (
                <pre className="max-h-64 overflow-auto rounded-[3px] border border-line bg-ink p-3 font-mono text-[10px] leading-[1.55] text-fg-dim">
                  {template}
                </pre>
              )}

              <p className="text-center font-mono text-[9px] uppercase tracking-[0.12em] text-fg-faint">
                creates real, billable AWS resources in account {meta.account}
              </p>

              {meta.stack.exists && (
                <div className="rounded-[3px] border border-danger/25 bg-danger/5 p-3.5">
                  <p className="u-label mb-1.5 !text-danger">Tear down</p>
                  <p className="text-[11px] text-fg-dim">
                    Delete every resource in <span className="font-mono">{meta.stackName}</span>.
                    Type the project name to confirm:
                  </p>
                  <div className="mt-2 flex gap-2">
                    <input
                      className="u-input !h-8 flex-1 font-mono !text-[11px]"
                      placeholder={projectName}
                      value={teardownInput}
                      onChange={(e) => setTeardownInput(e.target.value)}
                    />
                    <button
                      className="u-btn !h-8 hover:!border-danger/50 hover:!text-danger"
                      disabled={teardownInput !== projectName}
                      onClick={teardown}
                    >
                      <Trash2 size={12} />
                      Delete stack
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {phase === "creating" && (
            <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">
              <Loader2 size={12} className="animate-spin" /> computing change set against{" "}
              {meta?.stack.exists ? "the deployed stack" : "a fresh stack"}…
            </p>
          )}

          {phase === "review" && (
            <>
              <p className="u-label">
                Change set · {changes.length} change{changes.length === 1 ? "" : "s"}
              </p>
              <ul className="divide-y divide-line rounded-[3px] border border-line bg-ink">
                {changes.map((c, i) => (
                  <li key={i} className="flex items-center gap-3 px-3 py-2 font-mono text-[10.5px]">
                    <span className={`w-14 shrink-0 uppercase ${ACTION_COLOR[c.action] ?? "text-fg-dim"}`}>
                      {c.action}
                    </span>
                    <span className="truncate text-fg">{c.logicalId}</span>
                    <span className="ml-auto truncate text-fg-faint">{c.resourceType}</span>
                    {c.replacement === "True" && (
                      <span className="shrink-0 rounded-[2px] border border-danger/40 px-1 text-[8px] uppercase tracking-[0.08em] text-danger">
                        replace
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}

          {phase === "no_changes" && (
            <div className="rounded-[3px] border border-ok/30 bg-ok/5 p-4 text-center">
              <Check size={16} className="mx-auto mb-2 text-ok" />
              <p className="text-[12.5px] text-fg">The deployed stack already matches this design.</p>
            </div>
          )}

          {(phase === "deploying" || phase === "deleting" || (phase === "failed" && events.length > 0)) && (
            <>
              <p className="u-label flex items-center gap-2">
                {busy && <Loader2 size={11} className="animate-spin text-accent" />}
                {phase === "deleting" ? "Deleting stack" : phase === "failed" ? "Stack events" : "Deploying"}
              </p>
              <div
                ref={logRef}
                className="max-h-72 overflow-y-auto rounded-[3px] border border-line bg-ink p-3 font-mono text-[10px] leading-[1.7]"
              >
                {events.length === 0 && <span className="text-fg-faint">waiting for stack events…</span>}
                {events.map((e, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="shrink-0 text-fg-faint">
                      {new Date(e.at).toLocaleTimeString([], { hour12: false })}
                    </span>
                    <span className="w-44 shrink-0 truncate text-fg-dim">{e.logicalId}</span>
                    <span className={`shrink-0 ${eventColor(e.status)}`}>{e.status}</span>
                    {e.reason && <span className="truncate text-fg-faint" title={e.reason}>{e.reason}</span>}
                  </div>
                ))}
              </div>
            </>
          )}

          {phase === "deployed" && (
            <>
              <div className="rounded-[3px] border border-ok/30 bg-ok/5 p-3.5 text-center">
                <Check size={16} className="mx-auto mb-1.5 text-ok" />
                <p className="text-[13px] font-semibold text-fg">Stack deployed</p>
                <p className="mt-1 text-[11px] text-fg-dim">
                  Lambda placeholders return stub responses until you upload real code.
                </p>
              </div>
              {outputs && outputs.length > 0 && (
                <div>
                  <p className="u-label mb-2">Outputs</p>
                  <ul className="space-y-1.5">
                    {outputs.map((o) => (
                      <li key={o.key} className="rounded-[2px] border border-line bg-ink px-3 py-2">
                        <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-fg-faint">
                          {o.description || o.key}
                        </p>
                        <p className="select-all break-all font-mono text-[11px] text-accent">{o.value}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {phase === "deleted" && (
            <div className="rounded-[3px] border border-line bg-ink p-4 text-center">
              <Check size={16} className="mx-auto mb-2 text-ok" />
              <p className="text-[12.5px] text-fg">Stack deleted — every resource has been removed.</p>
            </div>
          )}

          {error && (
            <div className="rounded-[3px] border border-danger/40 bg-danger/5 px-3 py-2.5 text-[11.5px] leading-relaxed text-danger">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center gap-2 border-t border-line p-3.5">
          <button
            className="u-btn !h-8 !text-[11px]"
            onClick={() => downloadText("main.tf", generateTerraform(design()))}
            title="Export Terraform"
          >
            <FileCode2 size={12} />
            main.tf
          </button>
          <button
            className="u-btn !h-8 !text-[11px]"
            onClick={() => downloadText("template.json", template, "application/json")}
            title="Export CloudFormation"
          >
            <FileCode2 size={12} />
            template.json
          </button>
          {stackUrl && (
            <a href={stackUrl} target="_blank" rel="noreferrer" className="u-btn !h-8 !text-[11px]">
              <ExternalLink size={12} />
              Console
            </a>
          )}
          <div className="flex-1" />
          {phase === "preflight" && (
            <button
              className="inline-flex h-9 items-center gap-2 rounded-[3px] bg-amber px-5 text-[12.5px] font-semibold text-ink transition-colors hover:bg-[#ffc452] disabled:opacity-40"
              onClick={startChangeSet}
              disabled={!gateOpen || nodes.length === 0}
            >
              Compute change set
              <ArrowRight size={13} />
            </button>
          )}
          {phase === "review" && (
            <>
              <button className="u-btn !h-9" onClick={discard}>
                Discard
              </button>
              <button
                className="inline-flex h-9 items-center gap-2 rounded-[3px] bg-amber px-5 text-[12.5px] font-semibold text-ink transition-colors hover:bg-[#ffc452]"
                onClick={execute}
              >
                <Rocket size={13} />
                Deploy {changes.length} change{changes.length === 1 ? "" : "s"}
              </button>
            </>
          )}
          {(phase === "deployed" || phase === "deleted" || phase === "no_changes") && (
            <button className="u-btn !h-9" onClick={() => setOpen(false)}>
              Done
            </button>
          )}
          {phase === "failed" && (
            <button className="u-btn !h-9" onClick={loadMeta}>
              Start over
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
