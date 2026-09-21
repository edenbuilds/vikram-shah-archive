"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type Paper = { id: string; title: string; stage: string; page_count: number; matter_id: string };
type Matter = { id: string; title: string; stages: { id: string; title: string }[] };

// The single Ask box: pick sources (a matter, or particular papers in it), ask, watch the agent
// search and read, then land on the answer with its receipts.
export default function AskBox({ matters, papers, initialMatter, initialSources, initialQuestion = "", thread, locked }: {
  matters: Matter[]; papers: Paper[]; initialMatter: string; initialSources: string[]; initialQuestion?: string; thread?: string; locked?: string;
}) {
  const router = useRouter();
  const [matter, setMatter] = useState(initialMatter);
  const [picked, setPicked] = useState<Set<string>>(new Set(initialSources));
  const [filter, setFilter] = useState("");
  const [q, setQ] = useState(initialQuestion);
  const [steps, setSteps] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const m = matters.find((x) => x.id === matter);
  const mine = useMemo(() => papers.filter((p) => p.matter_id === matter), [papers, matter]);
  const shown = mine.filter((p) => !filter || p.title.toLowerCase().includes(filter.toLowerCase()));
  const toggle = (ids: string[], on: boolean) => setPicked((s) => { const n = new Set(s); ids.forEach((i) => (on ? n.add(i) : n.delete(i))); return n; });

  async function go(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim() || busy) return;
    setBusy(true); setSteps([]); setErr("");
    const res = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: q, thread, matter: matter || null, sources: matter && picked.size ? [...picked] : null }) });
    if (!res.ok || !res.body) { setErr(await res.text()); setBusy(false); return; }
    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = ""; let t = thread;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n"); buf = lines.pop() ?? "";
      for (const l of lines.filter(Boolean)) {
        const ev = JSON.parse(l);
        if (ev.type === "thread") t = ev.thread;
        if (ev.type === "step") setSteps((s) => [...s, ev.text]);
        if (ev.type === "error") setErr(ev.message);
      }
    }
    setBusy(false); setQ("");
    router.push(`/ask?t=${t}`); router.refresh();
  }

  return (
    <form onSubmit={go} className="card stack askbox">
      {!thread ? (
        <div className="stack" style={{ gap: ".6rem" }}>
          <div className="row" style={{ alignItems: "end" }}>
            <label style={{ flex: "1 1 16rem" }}>Sources
              <select value={matter} onChange={(e) => { setMatter(e.target.value); setPicked(new Set()); }}>
                <option value="">All my matters</option>
                {matters.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
              </select>
            </label>
            {matter && <span className="subtle" style={{ flex: "0 0 auto", paddingBottom: ".55rem" }}>{picked.size ? `${picked.size} of ${mine.length} papers chosen` : `All ${mine.length} papers`}</span>}
          </div>
          {matter && (
            <details className="sources" open={initialSources.length > 0}>
              <summary>Choose particular papers</summary>
              <div className="row" style={{ margin: ".5rem 0", alignItems: "center" }}>
                <input type="search" placeholder="Filter papers" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ flex: "1 1 12rem" }} />
                <button type="button" className="btn ghost small" style={{ flex: "0 0 auto" }} onClick={() => setPicked(new Set())}>Clear (use all)</button>
              </div>
              <div className="srclist">
                {(m?.stages ?? []).map((s) => {
                  const xs = shown.filter((p) => p.stage === s.id);
                  if (!xs.length) return null;
                  const all = xs.every((p) => picked.has(p.id));
                  return (
                    <fieldset key={s.id}>
                      <legend><label><input type="checkbox" checked={all} onChange={(e) => toggle(xs.map((p) => p.id), e.target.checked)} /> {s.title}</label></legend>
                      {xs.map((p) => (
                        <label key={p.id} className="src"><input type="checkbox" checked={picked.has(p.id)} onChange={(e) => toggle([p.id], e.target.checked)} />
                          <span>{p.title}</span><span className="subtle">{p.page_count} pp.</span></label>
                      ))}
                    </fieldset>
                  );
                })}
              </div>
            </details>
          )}
        </div>
      ) : <p className="subtle" style={{ margin: 0 }}>{locked}</p>}
      <textarea rows={3} value={q} onChange={(e) => setQ(e.target.value)} required aria-label="Question"
        placeholder={thread ? "Ask a follow-up…" : "Ask anything. The answer comes with receipts: the exact words, the paper and the page."}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) go(e as unknown as React.FormEvent); }} />
      {busy && <ol className="agent-steps">{steps.map((s, i) => <li key={i}>{s}</li>)}<li className="subtle">Working…</li></ol>}
      {err && <p className="err" style={{ margin: 0 }}>{err}</p>}
      <div className="row" style={{ justifyContent: "flex-end" }}><button className="btn" disabled={busy} style={{ flex: "0 0 auto" }}>{busy ? "Reading the papers…" : "Ask"}</button></div>
    </form>
  );
}
