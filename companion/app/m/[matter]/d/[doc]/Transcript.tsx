"use client";
import { toast } from "@/components/Toast";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { addAnnotation, addHighlight, addToCollection, deleteAnnotation, editAnnotation } from "@/app/actions";
import { COLOURS, colourOf, isHighlight } from "@/lib/highlight";
import EditDialog from "@/components/EditDialog";
import type { Block } from "@/lib/transcript";
import type { Ink } from "@/lib/pdf-comments";

export type Note = { id: string; page_no: number | null; char_start: number | null; char_end: number | null; quote: string | null; body: string; tags: string[]; created_at: string };
type Sel = { start: number; end: number; page: number | null; quote: string; x: number; y: number };

// Offset of (node, offset) measured from the start of the block element's text.
function offsetIn(el: Element, node: Node, off: number) {
  const r = document.createRange();
  r.selectNodeContents(el);
  r.setEnd(node, off);
  return r.toString().length;
}

// A block's text with her highlights drawn over the words they cover; the text itself is unchanged, so selection
// offsets still index the stored transcript.
// Rows spaced into columns (kind "spaced") keep every space as it is stored; each gap is wrapped so CSS can draw it as a column divider.
const piece = (s: string, gaps: boolean) => (gaps ? s.split(/( {3,}|\t+)/).map((x, i) => (i % 2 ? <span key={i} className="gap">{x}</span> : x)) : s);
function Marked({ text, base, hls, gaps = false }: { text: string; base: number; hls: Note[]; gaps?: boolean }) {
  const rs = hls.map((n) => [Math.max(n.char_start!, base) - base, Math.min(n.char_end!, base + text.length) - base, colourOf(n.tags), n.id] as const)
    .filter((r) => r[1] > r[0]).sort((a, b) => a[0] - b[0]);
  if (!rs.length) return <>{piece(text, gaps)}</>;
  const out: React.ReactNode[] = [];
  let at = 0;
  for (const [s0, e, c, id] of rs) {
    const s = Math.max(s0, at);
    if (e <= s) continue;
    out.push(piece(text.slice(at, s), gaps), <mark key={id} className="hl" style={{ ["--hl" as string]: c }}>{piece(text.slice(s, e), gaps)}</mark>);
    at = e;
  }
  out.push(piece(text.slice(at), gaps));
  return <>{out}</>;
}

export default function Reader({ matter, doc, pageCount, currentPage, jump, blocks, notes, scan, textSource, collections, printed, ink = [] }: {
  matter: string; doc: string; pageCount: number; currentPage: number; jump: boolean; blocks: Block[]; notes: Note[]; printed: Record<number, number>; ink?: Ink[];
  scan: string; textSource: string | null; collections: { id: string; title: string }[];
}) {
  const [sel, setSel] = useState<Sel | null>(null);
  const [pop, setPop] = useState(false);
  const [draw, setDraw] = useState<string | null>(null);  // the colour while she is drawing highlights on the scan
  const [live, setLive] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const from = useRef<{ x: number; y: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const noteBox = useRef<HTMLTextAreaElement>(null);
  const markBox = useRef<HTMLInputElement>(null);
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

  async function highlight(hex: string) {
    if (!sel) return;
    const f = new FormData();
    for (const [k, v] of Object.entries({ matter, doc, page: sel.page ?? currentPage, start: sel.start, end: sel.end, tags: `highlight,color:${hex}` })) f.set(k, String(v));
    setPop(false); setSel(null); window.getSelection()?.removeAllRanges();
    await addAnnotation(f); toast("Highlighted");
  }
  // Drawing on the scan: fractions of the page from its top left, the same shape the importer and the PDF export use.
  const at = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1), y: Math.min(Math.max((e.clientY - r.top) / r.height, 0), 1) };
  };
  async function drew(e: React.PointerEvent<HTMLDivElement>) {
    const a = from.current, b = at(e);
    from.current = null; setLive(null);
    if (!a || !draw) return;
    const box = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
    if (box.w < 0.01 && box.h < 0.006) return;  // a tap, not a drag
    const f = new FormData();
    for (const [k, v] of Object.entries({ matter, doc, page: currentPage, color: draw, ...box })) f.set(k, String(v));
    await addHighlight(f); toast("Highlighted");
  }

  // Archive transcripts open with the pipeline's own banner (case/forum/SHA/contents table), which
  // the page header already shows. Start at the paper itself: the first SECTION marker, if any.
  // Display only: offsets still index the stored transcript unchanged.
  const firstSection = blocks.findIndex((b) => b.kind === "meta" && b.text.startsWith("<!-- SECTION"));
  const shown = firstSection > 0 ? blocks.slice(firstSection) : blocks;
  const inBlock = (b: Block) => notes.filter((n) => n.char_start !== null && n.char_start >= b.start && n.char_start < b.end);
  const byBlock = (b: Block) => inBlock(b).filter((n) => !(isHighlight(n.tags) && !n.body));  // a bare highlight is the mark itself, listed under "on this page"
  const marked = notes.filter((n) => isHighlight(n.tags) && n.char_start !== null && n.char_end !== null);
  const onPage = notes.filter((n) => n.page_no === currentPage || n.char_start === null);

  return (
    <div className="reader">
      <div className="paper-text" ref={root} onMouseUp={onMouseUp}>
        <div className="src-label"><span>Verbatim transcript, as filed</span><span>Select text to highlight or add a note</span></div>
        {shown.map((b, i) => {
          if (b.kind === "meta") return null;
          if (b.kind === "rule") return <hr key={i} className="b b-rule" />;
          if (b.kind === "page")
            return (
              <div key={i} className={`b b-page${b.page === currentPage ? " current" : ""}`} data-page-mark={b.page ?? undefined}>
                <Link href={href(b.page ?? 1)} scroll={false}>{b.text.replace(/^#+\s*/, "")}{b.page && printed[b.page] && printed[b.page] !== b.page ? ` · printed ${printed[b.page]}` : ""}</Link>
              </div>
            );
          // Headings drop their "#" markup for display; data-start shifts by the same amount
          // so selection offsets still index the stored transcript exactly.
          const strip = b.kind === "heading" ? (b.text.match(/^#+\s*/)?.[0].length ?? 0) : 0;
          return (
            <div key={i}>
              <div className={`b b-${b.kind}`} data-start={b.start + strip} data-page={b.page ?? ""}><Marked gaps={b.kind === "spaced"} text={b.text.slice(strip)} base={b.start + strip} hls={marked.filter((n) => n.char_start! < b.end && n.char_end! > b.start + strip)} /></div>
              {byBlock(b).map((n) => <NoteCard key={n.id} n={n} matter={matter} doc={doc} />)}
            </div>
          );
        })}
      </div>

      {pop && sel && (
        <div className="sel-pop" style={{ left: sel.x, top: sel.y }} onMouseDown={(e) => e.preventDefault()} role="toolbar" aria-label="Selected text">
          {Object.entries(COLOURS).map(([name, hex]) => (
            <button key={name} type="button" className="swatch" style={{ background: hex }} aria-label={`Highlight ${name}`} title={`Highlight ${name}`} onClick={() => highlight(hex)} />
          ))}
          <button type="button" className="sel-note" onClick={() => { setPop(false); noteBox.current?.focus(); noteBox.current?.scrollIntoView({ block: "center", behavior: "smooth" }); }}>＋ Note</button>
        </div>
      )}

      <aside className="rail">
        <div className="card">
          <div className="hl-bar" role="group" aria-label="Highlight on the page">
            <span>Highlight the page</span>
            {Object.entries(COLOURS).map(([name, hex]) => (
              <button key={name} type="button" className="swatch" style={{ background: hex }} aria-pressed={draw === hex} aria-label={`Draw ${name} highlights`}
                title={draw === hex ? "Tap again to stop" : `Draw ${name} highlights on the scan`} onClick={() => setDraw(draw === hex ? null : hex)} />
            ))}
          </div>
          <div className="scan-frame">
            <div className="scan-ink">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={scan} alt={`Original scan of page ${currentPage}`} loading="eager" key={scan} />
              {/* her highlights where she drew them, in her colour (LiquidText ink or PDF highlights) */}
              {ink.filter((h) => h.page === currentPage).flatMap((h, i) => h.rects.map(([x, y, w, hh], k) => (
                <span key={`${i}-${k}`} className={h.body.startsWith("Pen marks") ? "ink-mark pen" : "ink-mark"} title={h.quote ?? h.body}
                  style={{ left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${hh * 100}%`, ["--ink" as string]: h.color ?? "#ffeb3b" }} />
              )))}
              {draw && (
                <div className="scan-draw" onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); from.current = at(e); }}
                  onPointerMove={(e) => { const a = from.current; if (a) { const b = at(e); setLive({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }); } }}
                  onPointerUp={drew} onPointerCancel={() => { from.current = null; setLive(null); }}>
                  {live && <span className="ink-mark" style={{ left: `${live.x * 100}%`, top: `${live.y * 100}%`, width: `${live.w * 100}%`, height: `${live.h * 100}%`, ["--ink" as string]: draw }} />}
                </div>
              )}
            </div>
          </div>
          <div className="pager">
            {currentPage > 1 ? <Link className="btn ghost small" href={href(currentPage - 1)} scroll={false}>←</Link> : <span className="btn ghost small" aria-hidden style={{ visibility: "hidden" }}>←</span>}
            <span className="where">Page <b>{currentPage}</b> of {pageCount}{printed[currentPage] && printed[currentPage] !== currentPage ? <>, printed <b>{printed[currentPage]}</b></> : ""}{textSource ? ` · ${textSource}` : ""}</span>
            {currentPage < pageCount ? <Link className="btn ghost small" href={href(currentPage + 1)} scroll={false}>→</Link> : <span className="btn ghost small" aria-hidden style={{ visibility: "hidden" }}>→</span>}
          </div>
        </div>

        <form action={async (f) => { await addAnnotation(f); toast("Bookmarked"); if (markBox.current) markBox.current.value = ""; }} className="row" style={{ gap: ".4rem" }}>
          <input type="hidden" name="matter" value={matter} />
          <input type="hidden" name="doc" value={doc} />
          <input type="hidden" name="page" value={currentPage} />
          <input type="hidden" name="tags" value="bookmark" />
          <input ref={markBox} type="text" name="body" required maxLength={120} placeholder={`Bookmark page ${currentPage} as…`} aria-label="Bookmark name" style={{ flex: "1 1 auto", minWidth: 0 }} />
          <button className="btn ghost small" style={{ flex: "0 0 auto" }}>Bookmark</button>
        </form>

        <form action={async (f) => { await addAnnotation(f); toast("Note saved"); setSel(null); window.getSelection()?.removeAllRanges(); if (noteBox.current) noteBox.current.value = ""; }} className="card stack note-form">
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
    <aside className="note" data-dbl>
      <span className="note-label">{isHighlight(n.tags) && <i className="swatch dot" style={{ background: colourOf(n.tags) }} aria-hidden />}{isHighlight(n.tags) ? "Highlight" : "Advocate\u2019s note"}{n.page_no ? ` · p. ${n.page_no}` : ""}</span>
      {n.quote && <blockquote>&ldquo;{n.quote.slice(0, 200)}{n.quote.length > 200 ? "…" : ""}&rdquo;</blockquote>}
      {n.body && !(isHighlight(n.tags) && n.body === "Highlight") && <div style={{ whiteSpace: "pre-wrap" }}>{n.body}</div>}
      <div className="row" style={{ alignItems: "center", marginTop: ".35rem" }}>
        <span style={{ flex: "1 1 auto" }}>{n.tags.map((t) => <span key={t} className="pill note" style={{ marginRight: ".25rem" }}>#{t}</span>)}</span>
        <span style={{ flex: "0 0 auto", marginRight: ".6rem" }}><EditDialog action={editAnnotation} hidden={{ id: n.id, matter, doc }} label={isHighlight(n.tags) ? "Add a note" : "Edit"} fields={[{ name: "body", label: "Your note", value: n.body === "Highlight" ? "" : n.body, rows: 5 }]} /></span>
        <form action={deleteAnnotation} style={{ flex: "0 0 auto" }}>
          <input type="hidden" name="id" value={n.id} /><input type="hidden" name="matter" value={matter} /><input type="hidden" name="doc" value={doc} />
          {n.tags.includes("drawn") && <input type="hidden" name="drawn" value="1" />}
          <button className="link subtle">delete</button>
        </form>
      </div>
    </aside>
  );
}
