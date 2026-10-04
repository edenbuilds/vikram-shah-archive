"use client";
import { useActionState, useState } from "react";
import { correctPageText, revertPageText, uploadCorrectedMarkdown } from "@/app/actions";
import type { PageHistory } from "@/lib/corrections";

const dmy = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata" }).replace(/\//g, "-");

// Fix what the reading got wrong on this page, or upload the edited Markdown of the whole paper.
// The scan is the record: the text first read is kept and can be put back.
export default function Correct({ doc, page, text, history }: { doc: string; page: number; text: string; history: PageHistory | null }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [up, upload, uploading] = useActionState(async (_: unknown, f: FormData) => uploadCorrectedMarkdown(f), null);
  const last = history?.versions.at(-1);
  return (
    <section className="card stack" style={{ gap: ".6rem" }}>
      <div className="row" style={{ justifyContent: "space-between", gap: ".5rem", flexWrap: "wrap", alignItems: "center" }}>
        <h3 style={{ margin: 0 }}>Text of page {page}</h3>
        {!open && <button className="btn ghost small" onClick={() => setOpen(true)}>Correct this page</button>}
      </div>
      {last && (
        <p className="subtle" style={{ margin: 0 }}>
          Corrected {history!.versions.length === 1 ? "once" : `${history!.versions.length} times`}, last by {last.by} on {dmy(last.at)}{last.reason ? ` (${last.reason})` : ""}.{" "}
          {confirm ? (
            <form action={async (f) => { await revertPageText(f); setConfirm(false); }} style={{ display: "inline" }}>
              <input type="hidden" name="doc" value={doc} /><input type="hidden" name="page" value={page} />
              Put back the text first read? <button className="link">Put back</button> <button type="button" className="link subtle" onClick={() => setConfirm(false)}>Keep</button>
            </form>
          ) : <button className="link subtle" onClick={() => setConfirm(true)}>Put back the original</button>}
        </p>
      )}
      {open && (
        <form action={async (f) => { await correctPageText(f); setOpen(false); }} className="stack" style={{ gap: ".5rem" }} key={`${page}-${text.length}`}>
          <input type="hidden" name="doc" value={doc} /><input type="hidden" name="page" value={page} />
          <textarea name="text" defaultValue={text} rows={14} aria-label={`Text of page ${page}`} style={{ fontFamily: "inherit" }} />
          <input name="reason" placeholder="What was wrong (optional)" maxLength={200} aria-label="What was wrong" />
          <p className="subtle" style={{ margin: 0 }}>Type only what the scan shows. Search, Ask and quotes use the corrected text.</p>
          <div className="row" style={{ justifyContent: "flex-end", gap: ".5rem" }}>
            <button type="button" className="btn ghost small" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn small">Save page {page}</button>
          </div>
        </form>
      )}
      <details>
        <summary className="subtle">Upload an edited Markdown of this paper</summary>
        <form action={upload} className="stack" style={{ gap: ".5rem", marginTop: ".5rem" }}>
          <input type="hidden" name="doc" value={doc} />
          <p className="subtle" style={{ margin: 0 }}>Download Markdown above, fix it in any editor, keep the &quot;## Page N&quot; headings, and upload it here. Only changed pages are saved.</p>
          <input type="file" name="file" accept=".md,.markdown,.txt,text/markdown,text/plain" required aria-label="Edited Markdown file" />
          <div className="row" style={{ justifyContent: "flex-end" }}><button className="btn small" disabled={uploading}>{uploading ? "Saving" : "Upload corrections"}</button></div>
          {up && <p role="status" className={up.ok ? "subtle" : "error"} style={{ margin: 0 }}>{up.message}</p>}
        </form>
      </details>
    </section>
  );
}
