"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { readHeld } from "@/app/actions";
import { toast } from "@/components/Toast";
import type { Stage } from "@/lib/taxonomies";

type Row = { path: string; name: string; size: number; at: string; view: string | null; ocr?: boolean };

// Files brought over from Arya Files. They are not read (no OCR, no summaries) until she presses Read.
export default function Held({ matter, stages, rows }: { matter: string; stages: Stage[]; rows: Row[] }) {
  const router = useRouter();
  const [stage, setStage] = useState(stages[0]?.id ?? "other");
  const [busy, start] = useTransition();
  const read = (paths: string[]) => start(async () => {
    try { await readHeld({ matter, stage, paths }); router.refresh(); }
    catch (e) { toast(e instanceof Error ? e.message : "Could not start reading"); }
  });
  return (
    <section className="card">
      <h3>From Arya Files, not read yet</h3>
      <p className="subtle" style={{ margin: "0 0 .6rem" }}>Nothing is OCR&apos;d or summarised until you choose Read.</p>
      <ul className="plain queue">
        {rows.map((r) => (
          <li key={r.path}>
            <span style={{ minWidth: 0 }}>
              {r.view ? <a href={r.view} target="_blank" rel="noreferrer" style={{ fontFamily: "var(--serif)" }}>{r.name}</a> : <span style={{ fontFamily: "var(--serif)" }}>{r.name}</span>}
              <div className="subtle">{(r.size / 1048576).toFixed(1)} MB · brought over {r.at}{r.ocr ? " · her text from Arya Files, read without OCR credits" : ""}</div>
            </span>
            <button type="button" className="btn ghost" disabled={busy} onClick={() => read([r.path])}>Read</button>
          </li>
        ))}
      </ul>
      <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap", alignItems: "center", marginTop: ".8rem" }}>
        <select value={stage} onChange={(e) => setStage(e.target.value)} aria-label="File under">
          {stages.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
        </select>
        {rows.length > 1 && <button type="button" className="btn" disabled={busy} onClick={() => read(rows.map((r) => r.path))}>{busy ? "Starting…" : `Read all ${rows.length}`}</button>}
      </div>
    </section>
  );
}
