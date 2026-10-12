"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { addAnnotation } from "@/app/actions";
import type { Note } from "../d/[doc]/Transcript";

export type Doc = { id: string; title: string; stage: string; pages: number };
export type Source = { key: string; file: string; when: string; status: string; doc: string | null; pages: number | null; how: string };
type Row = { title: string; page: number; level: number };

export default function Workspace({ matter, docs, doc, scans, outline, notes, sources, start, origin }: {
  matter: string; docs: Doc[]; doc: { id: string; title: string; pages: number }; scans: string[];
  outline: Row[]; notes: Note[]; sources: Source[]; start: number; origin: string;
}) {
  const router = useRouter();
  const [side, setSide] = useState<"docs" | "outline">("docs");
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(start);
  const [active, setActive] = useState<string | null>(null);
  const [line, setLine] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const reader = useRef<HTMLDivElement>(null);
  const notesBox = useRef<HTMLDivElement>(null);

  const [panes, setPanes] = useState({ left: true, right: true });
  const [zoom, setZoom] = useState(100);
  const [typed, setTyped] = useState<string | null>(null);
  const clamp = (p: number) => Math.min(Math.max(1, p), doc.pages);
  // Keyboard like a reader app: arrows / PageUp / PageDown turn pages, [ and ] hide the side panels, + and - zoom.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select")) return;
      const k = e.key;
      if (k === "ArrowDown" || k === "ArrowRight" || k === "PageDown") { e.preventDefault(); go(clamp(page + 1)); }
      else if (k === "ArrowUp" || k === "ArrowLeft" || k === "PageUp") { e.preventDefault(); go(clamp(page - 1)); }
      else if (k === "[") setPanes((x) => ({ ...x, left: !x.left }));
      else if (k === "]") setPanes((x) => ({ ...x, right: !x.right }));
      else if (k === "+" || k === "=") setZoom((z) => Math.min(z + 15, 200));
      else if (k === "-") setZoom((z) => Math.max(z - 15, 55));
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  });
  const go = (p: number) => reader.current?.querySelector(`#ws-p${p}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  useEffect(() => { if (start > 1) reader.current?.querySelector(`#ws-p${start}`)?.scrollIntoView({ block: "start" }); }, [start]);

  // The page most in view is the current page; its notes light up on the right.
  useEffect(() => {
    const io = new IntersectionObserver((es) => {
      const top = es.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (top) setPage(Number((top.target as HTMLElement).dataset.page));
    }, { root: reader.current, threshold: [0.25, 0.5, 0.75] });
    reader.current?.querySelectorAll("[data-page]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  // The connection: a line from the chosen note to its page, redrawn as either column scrolls.
  useLayoutEffect(() => {
    const draw = () => {
      const n = active && notesBox.current?.querySelector<HTMLElement>(`[data-note="${active}"]`);
      const pg = notes.find((x) => x.id === active)?.page_no;
      const el = pg && reader.current?.querySelector<HTMLElement>(`#ws-p${pg}`);
      if (!n || !el) return setLine(null);
      const a = n.getBoundingClientRect(), b = el.getBoundingClientRect(), r = reader.current!.getBoundingClientRect();
      setLine({ x1: a.left, y1: a.top + 18, x2: b.right, y2: Math.min(Math.max(b.top + 24, r.top + 8), r.bottom - 8) });
    };
    draw();
    const opts = { passive: true } as const;
    reader.current?.addEventListener("scroll", draw, opts);
    notesBox.current?.addEventListener("scroll", draw, opts);
    addEventListener("resize", draw);
    return () => { reader.current?.removeEventListener("scroll", draw); notesBox.current?.removeEventListener("scroll", draw); removeEventListener("resize", draw); };
  }, [active, notes]);

  const q = filter.trim().toLowerCase();
  const shownDocs = docs.filter((d) => !q || d.title.toLowerCase().includes(q));
  const marks = notes.filter((n) => n.tags.includes("bookmark"));
  const rows = [...outline, ...marks.map((b) => ({ title: b.body, page: b.page_no ?? 1, level: 0 }))]
    .filter((r) => !q || r.title.toLowerCase().includes(q)).sort((a, b) => a.page - b.page);
  const plain = notes.filter((n) => !n.tags.includes("bookmark"));
  const files = sources.length;

  return (
    <div className={`ws${panes.left ? "" : " no-left"}${panes.right ? "" : " no-right"}`}>
      <aside className="ws-left">
        <div className="ws-toggle" role="tablist">
          <button role="tab" aria-selected={side === "docs"} onClick={() => setSide("docs")}>Documents</button>
          <button role="tab" aria-selected={side === "outline"} onClick={() => setSide("outline")}>Outline</button>
        </div>
        <input className="ws-filter" placeholder={side === "docs" ? "Filter documents" : "Filter outline"} value={filter} onChange={(e) => setFilter(e.target.value)} />
        {side === "docs" ? (
          <ul className="ws-list">
            {shownDocs.map((d, i) => (
              <li key={d.id}>
                {(i === 0 || shownDocs[i - 1].stage !== d.stage) && <p className="ws-stage">{d.stage}</p>}
                <Link href={`/m/${matter}/workspace?d=${d.id}`} aria-current={d.id === doc.id ? "page" : undefined}>
                  <span>{d.title}</span><span className="subtle">{d.pages} pp.</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="ws-list">
            {rows.length === 0 && <li className="subtle" style={{ padding: ".5rem" }}>No outline or bookmarks in this paper.</li>}
            {rows.map((r, i) => (
              <li key={i}><button className={r.page === page ? "on" : ""} style={{ paddingLeft: `${0.6 + r.level * 0.8}rem` }} onClick={() => go(r.page)}>
                <span>Pg. {r.page} - {r.title}</span></button></li>
            ))}
          </ul>
        )}
        <details className="ws-sources">
          <summary>Source files <span className="subtle">{files}</span></summary>
          <ul className="plain">
            {sources.map((s) => (
              <li key={s.key}>
                <span>{s.file}</span>
                <span className="subtle">{s.how} {s.when}{s.pages ? ` · ${s.pages} pp.` : ""}{s.status !== "done" ? ` · ${s.status}` : ""}</span>
                {s.doc && <Link className="subtle" href={`/m/${matter}/workspace?d=${s.doc}`}>Open</Link>}
              </li>
            ))}
          </ul>
        </details>
      </aside>

      <section className="ws-mid">
        <header className="ws-bar">
          <button className="ws-icon" aria-pressed={panes.left} title="Documents and outline  [" onClick={() => setPanes((x) => ({ ...x, left: !x.left }))}>
            <svg viewBox="0 0 20 20" aria-hidden><rect x="2.5" y="3.5" width="15" height="13" rx="2" /><path d="M7.5 3.5v13" /></svg></button>
          <div className="ws-title">
            <strong>{doc.title}</strong>
            <span className="subtle" title={origin}>{origin}</span>
          </div>
          <div className="ws-tools">
            <button className="ws-icon" title="Previous page" disabled={page <= 1} onClick={() => go(clamp(page - 1))}>
              <svg viewBox="0 0 20 20" aria-hidden><path d="M12.5 4.5 7 10l5.5 5.5" /></svg></button>
            <label className="ws-page"><input inputMode="numeric" aria-label="Page" value={typed ?? page}
              onChange={(e) => setTyped(e.target.value)} onBlur={() => setTyped(null)}
              onKeyDown={(e) => { if (e.key === "Enter") { const n = Number(typed); if (Number.isInteger(n)) go(clamp(n)); setTyped(null); (e.target as HTMLInputElement).blur(); } }} />
              <span className="subtle">of {doc.pages}</span></label>
            <button className="ws-icon" title="Next page" disabled={page >= doc.pages} onClick={() => go(clamp(page + 1))}>
              <svg viewBox="0 0 20 20" aria-hidden><path d="M7.5 4.5 13 10l-5.5 5.5" /></svg></button>
            <span className="ws-sep" />
            <button className="ws-icon" title="Zoom out  -" onClick={() => setZoom((z) => Math.max(z - 15, 55))}>
              <svg viewBox="0 0 20 20" aria-hidden><path d="M5 10h10" /></svg></button>
            <button className="ws-zoom" title="Fit width" onClick={() => setZoom(100)}>{zoom}%</button>
            <button className="ws-icon" title="Zoom in  +" onClick={() => setZoom((z) => Math.min(z + 15, 200))}>
              <svg viewBox="0 0 20 20" aria-hidden><path d="M5 10h10M10 5v10" /></svg></button>
            <span className="ws-sep" />
            <Link className="ws-icon" title="Open this page in the reader" href={`/m/${matter}/d/${doc.id}?p=${page}`}>
              <svg viewBox="0 0 20 20" aria-hidden><path d="M8 4H4.5v11.5H16V12M11 4h5v5M16 4l-7 7" /></svg></Link>
          </div>
          <button className="ws-icon" aria-pressed={panes.right} title="Notes  ]" onClick={() => setPanes((x) => ({ ...x, right: !x.right }))}>
            <svg viewBox="0 0 20 20" aria-hidden><rect x="2.5" y="3.5" width="15" height="13" rx="2" /><path d="M12.5 3.5v13" /></svg></button>
        </header>
        <div ref={reader} className="ws-pages" style={{ "--zoom": zoom / 100 } as React.CSSProperties}>
          {scans.map((src, i) => (
            <figure key={i} id={`ws-p${i + 1}`} data-page={i + 1} className={notes.some((n) => n.id === active && n.page_no === i + 1) ? "lit" : ""}>
              <span className="ws-pno">P {i + 1}</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`Page ${i + 1}`} loading="lazy" width={850} height={1100} />
            </figure>
          ))}
        </div>
      </section>

      <aside className="ws-right">
        <p className="ws-stage">Notes · {plain.length}</p>
        <div ref={notesBox} className="ws-notes">
          {plain.length === 0 && <p className="subtle">No notes on this paper yet.</p>}
          {plain.map((n) => (
            <button key={n.id} data-note={n.id} className={`ws-note${n.id === active ? " on" : ""}${n.page_no === page ? " here" : ""}`}
              onClick={() => { setActive(n.id); if (n.page_no) go(n.page_no); }}>
              <span className="subtle">p. {n.page_no ?? "?"}</span>
              <span>{n.body}</span>
              {n.quote && <q>{n.quote.slice(0, 160)}</q>}
            </button>
          ))}
        </div>
        <form className="ws-add" action={async (f) => { await addAnnotation(f); router.refresh(); }}>
          <input type="hidden" name="matter" value={matter} />
          <input type="hidden" name="doc" value={doc.id} />
          <input type="hidden" name="page" value={page} />
          <textarea name="body" required rows={2} placeholder={`Note on p. ${page}`} />
          <button className="btn small">Add note</button>
        </form>
      </aside>

      {/* portalled: app/template.tsx animates a transform, which would make position:fixed relative to it */}
      {line && createPortal(
        <svg className="ws-link" aria-hidden>
          <path d={`M${line.x1},${line.y1} C${(line.x1 + line.x2) / 2},${line.y1} ${(line.x1 + line.x2) / 2},${line.y2} ${line.x2},${line.y2}`} />
          <circle cx={line.x2} cy={line.y2} r={4} />
        </svg>, document.body
      )}
    </div>
  );
}
