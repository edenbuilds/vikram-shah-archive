"use client";
import { useState } from "react";
import { toast } from "@/components/Toast";
import { deleteReport, resendReport, setReportFixed } from "@/app/actions";
import CopyButton from "../CopyButton";

export type Row = {
  id: string; at: string; by: string; kind: string; page: string; note: string; device: string; screen: string; shotUrl: string | null;
  mail: string; fixed: string | null; prompt: string;
};
const dmy = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata" }).replace(/\//g, "-");

// Every problem anyone reported from a screen (components/Report.tsx), newest first: the screenshot, the words, the device and the
// brief that was mailed. Fixed ones fold away but stay, so nothing is lost.
export default function Reports({ items }: { items: Row[] }) {
  const [confirm, setConfirm] = useState<string | null>(null);
  const open = items.filter((r) => !r.fixed), done = items.filter((r) => r.fixed);
  const card = (r: Row) => (
    <li key={r.id} className="card report-row">
      {r.shotUrl && <a href={r.shotUrl} target="_blank" rel="noreferrer" className="report-thumb"><img src={r.shotUrl} alt={`Screenshot for ${r.id}`} loading="lazy" /></a>}
      <div className="stack" style={{ gap: ".4rem", minWidth: 0 }}>
        <p style={{ margin: 0, overflowWrap: "anywhere" }}><b>{r.note || "No description"}</b></p>
        <p className="subtle" style={{ margin: 0 }}>{r.kind} on {r.page} · {r.id} · {dmy(r.at)} · {r.by}</p>
        <p className="subtle" style={{ margin: 0 }}>{r.device} · {r.screen}</p>
        <p className="subtle" style={{ margin: 0 }}>{r.mail === "sent" ? "Emailed to Omkar" : r.mail === "failed" ? "The email did not leave" : "Email not confirmed"}{r.fixed ? ` · Fixed ${dmy(r.fixed)}` : ""}</p>
        <div className="row" style={{ gap: ".5rem", flexWrap: "wrap" }}>
          <CopyButton text={r.prompt} label="Copy the brief" />
          <button className="btn ghost small" style={{ flex: "0 0 auto" }} onClick={async () => { await setReportFixed(r.id, !r.fixed); toast(r.fixed ? "Reopened" : "Marked fixed"); }}>{r.fixed ? "Reopen" : "Mark fixed"}</button>
          {r.mail !== "sent" && <button className="btn ghost small" style={{ flex: "0 0 auto" }} onClick={async () => { const m = await resendReport(r.id); toast(m === "sent" ? "Emailed" : "The email still did not leave", { tone: m === "sent" ? "ok" : "warn" }); }}>Resend email</button>}
          {confirm === r.id
            ? <span className="subtle">Delete it? <button className="link" onClick={async () => { await deleteReport(r.id); setConfirm(null); toast("Deleted"); }}>Delete</button> <button className="link subtle" onClick={() => setConfirm(null)}>Keep</button></span>
            : <button className="link subtle" onClick={() => setConfirm(r.id)}>delete</button>}
        </div>
        <details className="more"><summary>The brief for Claude</summary><pre className="report-brief">{r.prompt}</pre></details>
      </div>
    </li>
  );
  if (!items.length) return <p className="subtle">Nothing reported. Double-click or press and hold on empty space, or use your menu at the top right, then Report a problem.</p>;
  return (
    <div className="stack" style={{ gap: ".75rem" }}>
      {open.length > 0 ? <ul className="plain stack" style={{ gap: ".75rem" }}>{open.map(card)}</ul> : <p className="subtle">Nothing open.</p>}
      {done.length > 0 && <details className="more"><summary>Fixed ({done.length})</summary><ul className="plain stack" style={{ gap: ".75rem", marginTop: ".5rem" }}>{done.map(card)}</ul></details>}
    </div>
  );
}
