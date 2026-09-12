"use client";
import { useEffect, useRef, useState } from "react";
import { addAnnotation, deleteAnnotation } from "@/app/actions";
import type { Block } from "@/lib/transcript";

export type Note = { id: string; page_no: number | null; char_start: number | null; char_end: number | null; quote: string | null; body: string; tags: string[]; created_at: string };
type Sel = { start: number; end: number; page: number | null; quote: string };

// Offset of (node, offset) measured from the start of the block element's text.
function offsetIn(el: Element, node: Node, off: number) {
  const r = document.createRange();
  r.selectNodeContents(el);
  r.setEnd(node, off);
  return r.toString().length;
}

export default function Transcript({ matter, doc, currentPage, blocks, notes }: { matter: string; doc: string; currentPage: number; blocks: Block[]; notes: Note[] }) {
  const [sel, setSel] = useState<Sel | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    root.current?.querySelector(`[data-page-mark="${currentPage}"]`)?.scrollIntoView({ block: "start" });
  }, [currentPage]);

  function onMouseUp() {
    const s = window.getSelection();
    if (!s || s.isCollapsed || !root.current) return;
    const a = (s.anchorNode?.parentElement)?.closest("[data-start]");
    const f = (s.focusNode?.parentElement)?.closest("[data-start]");
    if (!a || !f || !root.current.contains(a)) return;
    const pos = (el: Element, n: Node, o: number) => Number((el as HTMLElement).dataset.start) + offsetIn(el, n, o);
    let start = pos(a, s.anchorNode!, s.anchorOffset);
    let end = pos(f, s.focusNode!, s.focusOffset);
    if (end < start) [start, end] = [end, start];
    const page = Number((a as HTMLElement).dataset.page) || null;
    setSel({ start, end, page, quote: s.toString() });
  }

  const byBlock = (b: Block) => notes.filter((n) => n.char_start !== null && n.char_start >= b.start && n.char_start < b.end);
  const loose = notes.filter((n) => n.char_start === null);

  return (
    <div>
      <div className="paper-text" ref={root} onMouseUp={onMouseUp}>
        <div className="src-label">Verbatim transcript, as filed. Select any text to add a note.</div>
        {blocks.map((b, i) => {
          if (b.kind === "meta") return null;
          if (b.kind === "rule") return <hr key={i} className="b b-rule" />;
          if (b.kind === "page")
            return (
              <div key={i} className="b b-page" data-page-mark={b.page ?? undefined}>
                <a href={`?p=${b.page}`}>{b.text.replace(/^#+\s*/, "")} · view scan</a>
              </div>
            );
          // Headings drop their "#" markup for display; data-start shifts by the same amount
          // so selection offsets still index the stored transcript exactly.
          const strip = b.kind === "heading" ? (b.text.match(/^#+\s*/)?.[0].length ?? 0) : 0;
          return (
            <div key={i}>
              <div className={`b b-${b.kind}${b.page === currentPage ? " current" : ""}`} data-start={b.start + strip} data-page={b.page ?? ""}>
                {b.text.slice(strip)}
              </div>
              {byBlock(b).map((n) => <NoteCard key={n.id} n={n} matter={matter} doc={doc} />)}
            </div>
          );
        })}
      </div>

      <div className="stack" style={{ marginTop: "1rem" }}>
        <form action={async (f) => { await addAnnotation(f); setSel(null); window.getSelection()?.removeAllRanges(); }} className="card stack" id="note-form">
          <h3>{sel ? "Note on the selected text" : `Note on page ${currentPage}`}</h3>
          {sel && <blockquote className="subtle" style={{ margin: 0 }}>&ldquo;{sel.quote.slice(0, 240)}{sel.quote.length > 240 ? "…" : ""}&rdquo; <button type="button" className="link" onClick={() => setSel(null)}>clear</button></blockquote>}
          <input type="hidden" name="matter" value={matter} />
          <input type="hidden" name="doc" value={doc} />
          <input type="hidden" name="page" value={sel?.page ?? currentPage} />
          <input type="hidden" name="start" value={sel?.start ?? ""} />
          <input type="hidden" name="end" value={sel?.end ?? ""} />
          <textarea name="body" placeholder="Your note (kept separate from the paper)" required />
          <input type="text" name="tags" placeholder="tags, comma separated: disputed-figure, next-hearing" />
          <button className="btn small">Save note</button>
        </form>
        {loose.length > 0 && (
          <div className="stack">
            <h3>Page notes</h3>
            {loose.map((n) => <NoteCard key={n.id} n={n} matter={matter} doc={doc} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function NoteCard({ n, matter, doc }: { n: Note; matter: string; doc: string }) {
  return (
    <aside className="note">
      <span className="note-label">Advocate&apos;s note{n.page_no ? ` · p. ${n.page_no}` : ""}</span>
      {n.quote && <blockquote>&ldquo;{n.quote.slice(0, 200)}{n.quote.length > 200 ? "…" : ""}&rdquo;</blockquote>}
      <div style={{ whiteSpace: "pre-wrap" }}>{n.body}</div>
      <div className="row" style={{ alignItems: "center", marginTop: ".3rem" }}>
        <span style={{ flex: "1 1 auto" }}>{n.tags.map((t) => <span key={t} className="pill note" style={{ marginRight: ".25rem" }}>{t}</span>)}</span>
        <form action={deleteAnnotation} style={{ flex: "0 0 auto" }}>
          <input type="hidden" name="id" value={n.id} /><input type="hidden" name="matter" value={matter} /><input type="hidden" name="doc" value={doc} />
          <button className="link subtle">delete</button>
        </form>
      </div>
    </aside>
  );
}
