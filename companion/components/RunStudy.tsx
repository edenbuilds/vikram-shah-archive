"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { watchMatter } from "@/components/JobWatcher";
import { toast } from "@/components/Toast";
import type { Job } from "@/lib/jobs";

// Starts a brief or a comparison and shows the agent's searching and reading as it happens.
export default function RunStudy({ matter, kind, label, ghost, placeholder, suggestions = [], point: fixed }: {
  matter: string; kind: "brief" | "explainer" | "reading" | "reading-all" | "compare" | "keep-brief" | "keep-explainer" | "keep-reading"; label: string; ghost?: boolean; placeholder?: string; suggestions?: string[]; point?: string;
}) {
  const router = useRouter();
  const [point, setPoint] = useState("");
  const [steps, setSteps] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [elsewhere, setElsewhere] = useState<Job | null>(null);  // the same job running from another window, or started by someone else
  const jk = kind === "reading-all" ? "reading" : kind;

  // 04-10-2026: a run goes on saving after this page is left (app/api/study). Coming back, or opening it from
  // another window or as another member, shows it still running instead of a button that would start it twice.
  useEffect(() => {
    if (kind.startsWith("keep-")) return;
    let dead = false, timer: ReturnType<typeof setTimeout>;
    const look = async () => {
      const jobs: Job[] = await fetch(`/api/study/jobs?matter=${encodeURIComponent(matter)}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
      const j = jobs.find((x) => x.kind === jk && x.status === "running") ?? null;
      if (dead) return;
      setElsewhere((was) => { if (was && !j) router.refresh(); return j; });
      timer = setTimeout(look, j ? 3000 : 30000);
    };
    look();
    return () => { dead = true; clearTimeout(timer); };
  }, [matter, jk, kind, router]);

  async function go(p = point) {
    if (busy || (kind === "compare" && !p.trim())) return;
    setBusy(true); setSteps([]); setErr(""); setPoint(p);
    if (!kind.startsWith("keep-")) { watchMatter(matter); toast("Started. It saves on its own, even if you leave this page.", { tone: "info" }); }
    try {
      const res = await fetch("/api/study", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, matter, point: p }) });
      if (!res.ok || !res.body) throw new Error(await res.text());
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() ?? "";
        for (const l of lines.filter(Boolean)) {
          const ev = JSON.parse(l);
          if (ev.type === "step") setSteps((s) => [...s.slice(-7), ev.text]);
          if (ev.type === "error") setErr(ev.message);
        }
      }
      if (kind === "compare") setPoint("");
      router.refresh();
    } catch (e) { setErr((e as Error).message || "Something went wrong. Try again."); toast("That did not finish. Try again.", { tone: "error" }); }
    setBusy(false);
  }

  return (
    <div className="stack" style={{ gap: ".6rem" }}>
      {kind === "compare" && !fixed ? (
        <form className="row" style={{ alignItems: "end" }} onSubmit={(e) => { e.preventDefault(); go(); }}>
          <label style={{ flex: "1 1 18rem" }}>The point
            <input type="text" value={point} onChange={(e) => setPoint(e.target.value)} placeholder={placeholder} disabled={busy} />
          </label>
          <button className="btn" disabled={busy || !point.trim()} style={{ flex: "0 0 auto" }}>{busy ? "Reading the papers…" : label}</button>
        </form>
      ) : (
        <div><button type="button" className={`btn${ghost ? " ghost" : ""}`} onClick={() => go(fixed ?? point)} disabled={busy || (!!elsewhere && !kind.startsWith("keep-"))}>{busy || elsewhere ? "Reading the papers…" : label}</button></div>
      )}
      {kind === "compare" && !fixed && !busy && !!suggestions.length && (
        <div className="chips"><span className="subtle" style={{ alignSelf: "center" }}>Try:</span>
          {suggestions.map((s) => <button key={s} type="button" className="chip" onClick={() => go(s)}>{s}</button>)}
        </div>
      )}
      {busy && kind !== "keep-brief" && (
        <ol className="agent-steps live" aria-live="polite">
          {steps.length ? steps.map((s, i) => <li key={i}>{s}</li>) : <li>Starting…</li>}
        </ol>
      )}
      {elsewhere && !busy && <p className="subtle" aria-live="polite" style={{ margin: 0 }}>Being made now{elsewhere.by ? ` (started by ${elsewhere.by.split("@")[0]})` : ""}{elsewhere.step ? `: ${elsewhere.step}` : ""}. It saves on its own; you can leave this page.</p>}
      {err && <p className="subtle" role="alert" style={{ margin: 0, color: "var(--seal)" }}>{err}</p>}
    </div>
  );
}
