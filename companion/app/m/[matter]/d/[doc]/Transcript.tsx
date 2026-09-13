"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { addAnnotation, addToCollection, deleteAnnotation } from "@/app/actions";
import type { Block } from "@/lib/transcript";

export type Note = { id: string; page_no: number | null; char_start: number | null; char_end: number | null; quote: string | null; body: string; tags: string[]; created_at: string };
type Sel = { start: number; end: number; page: number | null; quote: string; x: number; y: number };

// Offset of (node, offset) measured from the start of the block element's text.
function offsetIn(el: Element, node: Node, off: number) {
  const r = document.createRange();
  r.selectNodeContents(el);
  r.setEnd(node, off);
  return r.toString().length;
}

export default function Reader({ matter, doc, pageCount, currentPage, jump, blocks, notes, scan, textSource, collections }: {
  matter: string; doc: string; pageCount: number; currentPage: number; jump: boolean; blocks: Block[]; notes: Note[];
  scan: string; textSource: string | null; collections: { id: string; title: string }[];
}) {
  const [sel, setSel] = useState<Sel | null>(null);
  const [pop, setPop] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const noteBox = useRef<HTMLTextAreaElement>(null);
  const href = (n: number) => `/m/${matter}/d/${doc}?p=${n}`;

  // Scroll only when a page was asked for (pager, search hit, citation); never on a plain open.
  useEffect(() => {
    if (jump) root.current?.querySelector(`[data-page-mark="${currentPage}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [currentPage, jump]);

  useEffect(() => {
    const hide = () => setPop(false);
    window.addEventListener("scroll", hide, { passive: true });
    return () => window.removeEventListener("scroll", hide);
  }, []);

  function onMouseUp() {
    const s = window.getSelection();
    if (!s || s.isCollapsed || !root.current) return setPop(false);
    const a = s.anchorNode?.parentElement?.closest("[data-start]");
    const f = s.focusNode?.parentElement?.closest("[data-start]");
    if (!a || !f || !root.current.contains(a)) return setPop(false);
    const pos = (el: Element, n: Node, o: number) => Number((el as HTMLElement).dataset.start) + offsetIn(el, n, o);
    let start = pos(a, s.anchorNode!, s.anchorOffset);
    let end = pos(f, s.focusNode!, s.focusOffset);
    if (end < start) [start, end] = [end, start];
    const r = s.getRangeAt(0).getBoundingClientRect();
    setSel({ start, end, page: Number((a as HTMLElement).dataset.page) || null, quote: s.toString(), x: r.left + r.width / 2, y: r.top });
    setPop(true);
  }

  // Archive transcripts open with the pipeline's own banner (case/forum/SHA/contents table), which
  // the page header already shows. Start at the paper itself: the first SECTION marker, if any.
  // Display only: offsets still index the stored transcript unchanged.
  const firstSection = blocks.findIndex((b) => b.kind === "meta" && b.text.startsWith("<!-- SECTION"));
  const shown = firstSection > 0 ? blocks.slice(firstSection) : blocks;
  const byBlock = (b: Block) => notes.filter((n) => n.char_start !== null && n.char_start >= b.start && n.char_start < b.end);
  const onPage = notes.filter((n) => n.page_no === currentPage || n.char_start === null);

  return (
    <div className="reader">
      <div className="paper-text" ref={root} onMouseUp={onMouseUp}>
        <div className="src-label"><span>Verbatim transcript, as filed</span><span>Select text to add a note</span></div>
        {shown.map((b, i) => {
          if (b.kind === "meta") return null;
          if (b.kind === "rule") return <hr key={i} className="b b-rule" />;
          if (b.kind === "page")
            return (
              <div key={i} className={`b b-page${b.page === currentPage ? " current" : ""}`} data-page-mark={b.page ?? undefined}>
                <Link href={href(b.page ?? 1)} scroll={false}>{b.text.replace(/^#+\s*/, "")}</Link>
              </div>
            );
          // Headings drop their "#" markup for display; data-start shifts by the same amount
          // so selection offsets still index the stored transcript exactly.
          const strip = b.kind === "heading" ? (b.text.match(/^#+\s*/)?.[0].length ?? 0) : 0;
          return (
            <div key={i}>
              <div className={`b b-${b.kind}`} data-start={b.start + strip} data-page={b.page ?? ""}>{b.text.slice(strip)}</div>
              {byBlock(b).map((n) => <NoteCard key={n.id} n={n} matter={matter} doc={doc} />)}
            </div>
          );
        })}
      </div>

      {pop && sel && (
        <button className="sel-pop" style={{ left: sel.x, top: sel.y }} onMouseDown={(e) => e.preventDefault()}
          onClick={() => { setPop(false); noteBox.current?.focus(); noteBox.current?.scrollIntoView({ block: "center", behavior: "smooth" }); }}>
          ＋ Note on selection
        </button>
      )}

      <aside className="rail">
        <div className="card">
          <div className="scan-frame">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={scan} alt={`Original scan of page ${currentPage}`} loading="eager" key={scan} />
          </div>
          <div className="pager">
            {currentPage > 1 ? <Link className="btn ghost small" href={href(currentPage - 1)} scroll={false}>←</Link> : <span className="btn ghost small" aria-hidden style={{ visibility: "hidden" }}>←</span>}
            <span className="where">Page <b>{currentPage}</b> of {pageCount}{textSource ? ` · ${textSource}` : ""}</span>
            {currentPage < pageCount ? <Link className="btn ghost small" href={href(currentPage + 1)} scroll={false}>→</Link> : <span className="btn ghost small" aria-hidden style={{ visibility: "hidden" }}>→</span>}
          </div>
        </div>

        <form action={async (f) => { await addAnnotation(f); setSel(null); window.getSelection()?.removeAllRanges(); if (noteBox.current) noteBox.current.value = ""; }} className="card stack note-form">
          <h3 style={{ margin: 0 }}>{sel ? "Note on selected text" : `Note on page ${currentPage}`}</h3>
          {sel ? (
            <blockquote className="subtle" style={{ margin: 0, fontFamily: "var(--serif)" }}>
              &ldquo;{sel.quote.slice(0, 200)}{sel.quote.length > 200 ? "…" : ""}&rdquo; <button type="button" className="link" onClick={() => setSel(null)}>clear</button>
            </blockquote>
          ) : <p className="subtle" style={{ margin: 0 }}>Tip: select words in the transcript to pin the note to that exact passage.</p>}
          <input type="hidden" name="matter" value={matter} />
          <input type="hidden" name="doc" value={doc} />
          <input type="hidden" name="page" value={sel?.page ?? currentPage} />
          <input type="hidden" name="start" value={sel?.start ?? ""} />
          <input type="hidden" name="end" value={sel?.end ?? ""} />
          <textarea ref={noteBox} name="body" rows={3} placeholder="Your note: kept separate from the paper" required />
          <input type="text" name="tags" placeholder="tags: disputed-figure, next-hearing, status" />
          <div><button className="btn small">Save note</button></div>
        </form>

        {onPage.length > 0 && (
          <div className="stack" style={{ gap: ".5rem" }}>
            <p className="subtle" style={{ margin: 0, textTransform: "uppercase", letterSpacing: ".08em", fontSize: ".72rem" }}>Notes on this page</p>
            {onPage.map((n) => <NoteCard key={n.id} n={n} matter={matter} doc={doc} />)}
          </div>
        )}

        <details className="card">
          <summary><b>Add to a collection</b></summary>
          <form action={addToCollection} className="stack" style={{ marginTop: ".7rem" }}>
            <input type="hidden" name="matter" value={matter} />
            <input type="hidden" name="doc" value={doc} />
            <input type="hidden" name="page" value={currentPage} />
            <select name="collection" defaultValue="">
              <option value="">New collection…</option>
              {collections.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
            <input type="text" name="new_title" placeholder='New collection, e.g. "Disputed figures"' />
            <input type="text" name="note" placeholder={`Why (optional), pinned to p. ${currentPage}`} />
            <div><button className="btn ghost small">Add this paper</button></div>
          </form>
        </details>
      </aside>
    </div>
  );
}

function NoteCard({ n, matter, doc }: { n: Note; matter: string; doc: string }) {
  return (
    <aside className="note">
      <span className="note-label">Advocate&apos;s note{n.page_no ? ` · p. ${n.page_no}` : ""}</span>
      {n.quote && <blockquote>&ldquo;{n.quote.slice(0, 200)}{n.quote.length > 200 ? "…" : ""}&rdquo;</blockquote>}
      <div style={{ whiteSpace: "pre-wrap" }}>{n.body}</div>
      <div className="row" style={{ alignItems: "center", marginTop: ".35rem" }}>
        <span style={{ flex: "1 1 auto" }}>{n.tags.map((t) => <span key={t} className="pill note" style={{ marginRight: ".25rem" }}>#{t}</span>)}</span>
        <form action={deleteAnnotation} style={{ flex: "0 0 auto" }}>
          <input type="hidden" name="id" value={n.id} /><input type="hidden" name="matter" value={matter} /><input type="hidden" name="doc" value={doc} />
          <button className="link subtle">delete</button>
        </form>
      </div>
    </aside>
  );
}
