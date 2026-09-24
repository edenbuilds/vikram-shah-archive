"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

// Starts a brief or a comparison and shows the agent's searching and reading as it happens.
export default function RunStudy({ matter, kind, label, ghost, placeholder, suggestions = [], point: fixed }: {
  matter: string; kind: "brief" | "explainer" | "compare" | "keep-brief" | "keep-explainer"; label: string; ghost?: boolean; placeholder?: string; suggestions?: string[]; point?: string;
}) {
  const router = useRouter();
  const [point, setPoint] = useState("");
  const [steps, setSteps] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function go(p = point) {
    if (busy || (kind === "compare" && !p.trim())) return;
    setBusy(true); setSteps([]); setErr(""); setPoint(p);
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
    } catch (e) { setErr((e as Error).message || "Something went wrong. Try again."); }
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
        <div><button type="button" className={`btn${ghost ? " ghost" : ""}`} onClick={() => go(fixed ?? point)} disabled={busy}>{busy ? "Reading the papers…" : label}</button></div>
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
      {err && <p className="subtle" role="alert" style={{ margin: 0, color: "var(--seal)" }}>{err}</p>}
    </div>
  );
}
