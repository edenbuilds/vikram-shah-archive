"use client";
import { useState } from "react";
import Link from "next/link";
import RubberSegment from "@/components/rb/RubberSegment";
import { toast } from "@/components/Toast";
import { approveChange, declineChange, restoreMemory, setMcpMode, undoChange } from "@/app/actions";
import type { Mode } from "@/lib/mcp-control";

export type Wait = { id: string; at: string; summary: string; edit: string | null; href: string | null; big: boolean; failed: string | null };
export type Done = { id: string; at: string; via: string; summary: string; canUndo: boolean; undone: string | null };
export type Gone = { id: string; text: string; gone: string };
const dmy = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata" }).replace(/\//g, "-");
const MODES = [{ value: "review", label: "Ask me first" }, { value: "allow", label: "Allow, with undo" }, { value: "off", label: "Read only" }];
const LINE: Record<Mode, string> = {
  review: "A connected app can suggest a change. Nothing is saved until you approve it here, and you can edit it first.",
  allow: "Connected apps save changes straight away. Each one is listed below with an Undo.",
  off: "Connected apps can read and search your papers but cannot change anything.",
};

// What connected AI apps may do to her workspace: the mode (enforced by the server, lib/mcp-control.ts), the changes waiting for her,
// what was changed and how to take it back, and the memories that were forgotten and can be put back.
export default function Control({ mode, waiting, done, gone }: { mode: Mode; waiting: Wait[]; done: Done[]; gone: Gone[] }) {
  const [m, setM] = useState<Mode>(mode);
  const [text, setText] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<Record<string, string>>({});
  const run = async (id: string, f: () => Promise<string | null | void>, ok: string) => {
    setBusy(id);
    try { const e = await f(); if (e) setErr((x) => ({ ...x, [id]: e })); else toast(ok); } finally { setBusy(null); }
  };
  return (
    <div className="stack" style={{ gap: "1rem" }}>
      <div className="card stack" style={{ gap: ".6rem" }}>
        <RubberSegment aria-label="What connected apps may do" className="seg-rb" size="sm" value={m} trackColor="var(--paper-deep)" thumbColor="var(--white)" textColor="var(--muted)" activeTextColor="var(--ink)"
          items={MODES} onChange={(v) => { setM(v as Mode); void setMcpMode(v as Mode); }} />
        <p className="subtle" style={{ margin: 0 }}>{LINE[m]}</p>
      </div>

      {waiting.length > 0 && (
        <div className="stack" style={{ gap: ".6rem" }}>
          <h3 style={{ margin: 0 }}>Waiting for you ({waiting.length})</h3>
          <ul className="plain stack" style={{ gap: ".6rem" }}>
            {waiting.map((w) => (
              <li key={w.id} className="card stack" id={`change-${w.id}`} style={{ gap: ".5rem" }}>
                <p style={{ margin: 0, overflowWrap: "anywhere" }}><b>{w.summary}</b></p>
                {w.edit !== null && (
                  <label className="stack" style={{ gap: ".25rem" }}><span className="subtle">{w.big ? "The corrected text of the page. Compare it with the scan before you approve." : "Edit before you approve"}</span>
                    <textarea rows={w.big ? 10 : 3} value={text[w.id] ?? w.edit} onChange={(e) => setText((x) => ({ ...x, [w.id]: e.target.value }))} />
                  </label>
                )}
                {(err[w.id] || w.failed) && <p className="subtle" style={{ margin: 0 }}>{err[w.id] ?? `Could not apply it: ${w.failed}`}</p>}
                <div className="row" style={{ gap: ".5rem", flexWrap: "wrap", alignItems: "center" }}>
                  <button className="btn small" style={{ flex: "0 0 auto" }} disabled={busy === w.id} onClick={() => run(w.id, () => approveChange(w.id, w.edit !== null ? text[w.id] ?? w.edit : undefined), "Approved and saved")}>{busy === w.id ? "Saving…" : "Approve"}</button>
                  <button className="btn ghost small" style={{ flex: "0 0 auto" }} disabled={busy === w.id} onClick={() => run(w.id, () => declineChange(w.id), "Declined")}>Decline</button>
                  {w.href && <Link className="link subtle" href={w.href}>Open the paper</Link>}
                  <span className="subtle">{dmy(w.at)}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="more" open={done.length > 0 && waiting.length === 0}>
        <summary>What was changed ({done.length})</summary>
        {done.length === 0 ? <p className="subtle">Nothing yet.</p> : (
          <ul className="plain stack" style={{ gap: ".4rem", marginTop: ".5rem" }}>
            {done.map((d) => (
              <li key={d.id} className="card row" style={{ padding: ".6rem .9rem", gap: ".75rem", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{d.summary}<span className="subtle"> · {d.via === "approved" ? "you approved" : "an AI app"} · {dmy(d.at)}{d.undone ? ` · undone ${dmy(d.undone)}` : ""}</span></span>
                {d.canUndo && !d.undone && <button className="btn ghost small" style={{ flex: "0 0 auto" }} disabled={busy === d.id} onClick={() => run(d.id, () => undoChange(d.id), "Undone")}>Undo</button>}
              </li>
            ))}
          </ul>
        )}
      </details>

      {gone.length > 0 && (
        <details className="more">
          <summary>Recently forgotten ({gone.length})</summary>
          <ul className="plain stack" style={{ gap: ".4rem", marginTop: ".5rem" }}>
            {gone.map((g) => (
              <li key={g.id} className="card row" style={{ padding: ".6rem .9rem", gap: ".75rem", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{g.text}<span className="subtle"> · {dmy(g.gone)}</span></span>
                <button className="btn ghost small" style={{ flex: "0 0 auto" }} disabled={busy === g.id} onClick={() => run(g.id, () => restoreMemory(g.id), "Put back")}>Restore</button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
