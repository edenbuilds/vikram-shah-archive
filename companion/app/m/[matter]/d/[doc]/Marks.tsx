"use client";
import { useState } from "react";
import { toast } from "@/components/Toast";
import { MARK_LABEL, type PageMarks } from "@/lib/marks";

const ist = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata" }).replace(/\//g, "-");

// CC-62B3E4: the stamps, seals, signatures and handwriting on this page, listed from the scan when she asks. Kept apart from the filed text and her notes.
export default function Marks({ matter, doc, page, initial }: { matter: string; doc: string; page: number; initial: PageMarks | null }) {
  const [found, setFound] = useState<PageMarks | null>(initial);
  const [busy, setBusy] = useState(false);
  async function read() {
    setBusy(true);
    try {
      const r = await fetch("/api/marks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ matter, doc, page }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "The page could not be read just now. Try again in a minute.");
      setFound(j as PageMarks);
    } catch (e) { toast((e as Error).message, { tone: "error" }); }
    setBusy(false);
  }
  return (
    <section className="card marks" aria-live="polite">
      <h3>Marks on this page</h3>
      {!found ? <p className="subtle">Stamps, seals, signatures and handwriting, listed from the scan.</p>
        : !found.marks.length ? <p className="subtle">No stamps, seals, signatures or handwriting found on this page.</p>
        : (
          <ul className="plain">
            {found.marks.map((m, i) => (
              <li key={i}><span><b>{MARK_LABEL[m.kind]}</b>{m.where ? `, ${m.where}` : ""}</span><span>{m.what}</span>{m.text && <q>{m.text}</q>}</li>
            ))}
          </ul>
        )}
      {found && <p className="subtle">Read from the scan by an agent on {ist(found.at)}. It is not part of the filed text, so check it against the scan.</p>}
      <button type="button" className="btn ghost small" disabled={busy} onClick={read}>{busy ? "Reading the page…" : found ? "Read again" : "Find stamps and marks"}</button>
    </section>
  );
}
