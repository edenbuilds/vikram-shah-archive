"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { addAnnotation, addExcerpt, keepHandText, loadDoc, moveDocOrder, readHand } from "@/app/actions";
import type { Note } from "@/app/m/[matter]/d/[doc]/Transcript";
import type { Bundle } from "@/lib/workspace";

export type Doc = { id: string; title: string; file: string; from: number; stage: string; pages: number; added: string; origin: string };
export type Source = { key: string; file: string; when: string; status: string; doc: string | null; pages: number | null; how: string };
type Sort = "order" | "title" | "newest" | "oldest";
const SORTS: [Sort, string][] = [["order", "Stage and order"], ["title", "Title"], ["newest", "Newest first"], ["oldest", "Oldest first"]];
const at = (doc: string, p: number) => `[data-doc="${doc}"] [data-page="${p}"]`;

// 13-10-2026 (Omkar): "I should see all the docs uploaded in one continuous scroll", move any paper up or down, and sort
// them. Every paper is one section of the scroll; its pages load as it comes near. The panels follow the paper in view.
export default function Workspace({ matter, docs, first, sources, start }: {
  matter: string; docs: Doc[]; first: Bundle & { id: string }; sources: Source[]; start: number;
}) {
  const router = useRouter();
  const [cache, setCache] = useState<Record<string, Bundle>>({ [first.id]: first });
  const asked = useRef(new Set([first.id]));
  const [cur, setCur] = useState(first.id);
  const [side, setSide] = useState<"docs" | "outline">("docs");
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<Sort>("order");
  // 13-10-2026 (Omkar): rendering every paper made it slow, and she wants to read each source file as it is. By default
  // the left lists source files and the middle shows only the chosen file; "Papers and filters" brings back the split
  // papers with filter, sort and moves, each folded until she opens it.
  const [split, setSplit] = useState(false);
  const [file, setFile] = useState(docs.find((d) => d.id === first.id)?.file ?? docs[0].file);
  const [open, setOpen] = useState<Set<string>>(new Set([first.id]));
  const [page, setPage] = useState(start);
  const [active, setActive] = useState<string | null>(null);
  const [line, setLine] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const reader = useRef<HTMLDivElement>(null);
  const notesBox = useRef<HTMLDivElement>(null);
  const [panes, setPanes] = useState({ left: true, right: true });
  const [zoom, setZoom] = useState(100);
  const [squeeze, setSqueeze] = useState(false);  // LiquidText's "highlight view": only the pages she has marked
  const [typed, setTyped] = useState<string | null>(null);
  const [pick, setPick] = useState<{ doc: string; page: number; picked: string; rects: number[][]; x: number; y: number } | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);

  // on a phone the notes are a sheet over the pages, so they start closed
  const [phone, setPhone] = useState(false);
  useEffect(() => { if (matchMedia("(max-width: 760px)").matches) { setPhone(true); setPanes((x) => ({ ...x, right: false })); } }, []);
  useEffect(() => { try { setSplit(localStorage.getItem("ws-papers") === "1"); } catch {} }, []);
  const pickSplit = (v: boolean) => { setSplit(v); try { localStorage.setItem("ws-papers", v ? "1" : "0"); } catch {} };
  useEffect(() => { try { const s = localStorage.getItem("ws-sort") as Sort | null; if (s && SORTS.some(([k]) => k === s)) setSort(s); } catch {} }, []);
  const pickSort = (s: Sort) => { setSort(s); try { localStorage.setItem("ws-sort", s); } catch {} };

  const ordered = useMemo(() => {
    const by = [...docs];
    if (sort === "title") by.sort((a, b) => a.title.localeCompare(b.title, "en", { numeric: true }));
    else if (sort === "newest") by.sort((a, b) => b.added.localeCompare(a.added));
    else if (sort === "oldest") by.sort((a, b) => a.added.localeCompare(b.added));
    return split ? by : by.filter((d) => d.file === file).sort((a, c) => a.from - c.from);
  }, [docs, sort, split, file]);
  const files = useMemo(() => [...new Map(docs.map((d) => [d.file, docs.filter((x) => x.file === d.file)])).entries()], [docs]);
  const shut = (id: string) => split && !open.has(id);
  const doc = docs.find((d) => d.id === cur) ?? docs[0];
  const b = cache[cur];
  const notes = b?.notes ?? [];
  const markedOf = (x?: Bundle) => new Set((x?.notes ?? []).map((n) => n.page_no).filter(Boolean));
  const marked = markedOf(b);

  const reload = useCallback(async (id: string) => {
    const x = await loadDoc(matter, id);
    if (x) setCache((c) => ({ ...c, [id]: x }));
  }, [matter]);
  const need = useCallback((id: string) => {
    if (asked.current.has(id)) return;
    asked.current.add(id);
    reload(id);
  }, [reload]);

  const clamp = (p: number) => Math.min(Math.max(1, p), doc.pages);
  const go = (p: number, id = cur) => reader.current?.querySelector(at(id, p))?.scrollIntoView({ behavior: "smooth", block: "start" });
  const goDoc = (id: string) => {
    setOpen((f) => new Set(f).add(id));
    const f = docs.find((d) => d.id === id)?.file;
    if (!split && f) setFile(f);
    requestAnimationFrame(() => reader.current?.querySelector(`section[data-doc="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const move = async (id: string, dir: -1 | 1) => {
    setMoving(id);
    await moveDocOrder(id, dir);
    router.refresh();
    setMoving(null);
  };

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
  useEffect(() => { reader.current?.querySelector(at(first.id, start))?.scrollIntoView({ block: "start" }); }, [first.id, start]);

  // The page most in view is the current page of the current paper; that paper's notes and outline show at the sides.
  const order = ordered.map((d) => d.id).join() + [...open].join() + split;
  useEffect(() => {
    const io = new IntersectionObserver((es) => {
      const top = es.filter((e) => e.isIntersecting).sort((a, c) => c.intersectionRatio - a.intersectionRatio)[0];
      if (!top) return;
      const el = top.target as HTMLElement, id = el.closest<HTMLElement>("section[data-doc]")!.dataset.doc!;
      setCur(id);
      setPage(Number(el.dataset.page));
    }, { threshold: [0.25, 0.5, 0.75] });
    reader.current?.querySelectorAll("[data-page]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [order]);
  // Papers load as they come within a couple of screens.
  useEffect(() => {
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && need((e.target as HTMLElement).dataset.doc!)), { rootMargin: "1500px 0px" });
    reader.current?.querySelectorAll("section[data-doc][data-open]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [order, need]);
  useEffect(() => { history.replaceState(history.state, "", `?d=${cur}&p=${page}`); }, [cur, page]);

  // Words selected on one scan become a pending excerpt; the button (or dropping the selection on the notes) files it.
  useEffect(() => {
    const up = () => {
      const s = getSelection();
      const fig = s && !s.isCollapsed && (s.anchorNode?.parentElement?.closest("figure[data-page]") as HTMLElement | null);
      if (!s || !fig || !s.rangeCount) return setPick(null);
      const range = s.getRangeAt(0);
      const hit = [...fig.querySelectorAll<SVGTextElement>(".ws-text text")].filter((t) => range.intersectsNode(t));
      if (!hit.length) return setPick(null);
      const r = range.getBoundingClientRect();
      setPick({
        doc: fig.closest<HTMLElement>("section[data-doc]")!.dataset.doc!, page: Number(fig.dataset.page), picked: hit.map((t) => t.textContent).join(" "),
        rects: hit.map((t) => { const [x0, y0, x1, y1] = t.dataset.b!.split(",").map(Number); return [x0, y0, x1 - x0, y1 - y0]; }),
        x: r.right, y: r.bottom,
      });
    };
    document.addEventListener("mouseup", up);
    document.addEventListener("keyup", up);
    return () => { document.removeEventListener("mouseup", up); document.removeEventListener("keyup", up); };
  }, []);
  const excerpt = async () => {
    if (!pick) return;
    const p = pick;
    setPick(null);
    getSelection()?.removeAllRanges();
    const r = await addExcerpt({ matter, doc: p.doc, page: p.page, picked: p.picked, rects: p.rects });
    setSaid(r.error ?? null);
    if (!r.error) reload(p.doc);
  };

  // The connection: a line from the chosen note to its page, redrawn as either column scrolls.
  useLayoutEffect(() => {
    const draw = () => {
      const n = active && notesBox.current?.querySelector<HTMLElement>(`[data-note="${active}"]`);
      const note = notes.find((x) => x.id === active), pg = note?.page_no;
      const el = pg && reader.current?.querySelector<HTMLElement>(at(cur, pg));
      if (!n || !el) return setLine(null);
      // 13-10-2026 (Omkar): the line should land on the words the note is about, not the top of the page
      const ink = b?.ink.find((h) => h.id === active);
      const [l, t, w, hh] = ink?.rects[0] ?? [];
      const a = n.getBoundingClientRect(), c = el.getBoundingClientRect(), r = reader.current!.getBoundingClientRect();
      const y = t === undefined ? c.top + 24 : c.top + (t + hh / 2) * c.height;
      setLine({ x1: a.left, y1: a.top + 18, x2: l === undefined ? c.right : Math.min(c.left + (l + w) * c.width, c.right), y2: Math.min(Math.max(y, r.top + 8), r.bottom - 8) });
    };
    draw();
    const opts = { passive: true } as const;
    reader.current?.addEventListener("scroll", draw, opts);
    notesBox.current?.addEventListener("scroll", draw, opts);
    addEventListener("resize", draw);
    return () => { reader.current?.removeEventListener("scroll", draw); notesBox.current?.removeEventListener("scroll", draw); removeEventListener("resize", draw); };
  }, [active, notes, cur, b]);

  const q = filter.trim().toLowerCase();
  const shownDocs = ordered.filter((d) => !q || d.title.toLowerCase().includes(q));
  const marks = notes.filter((n) => n.tags.includes("bookmark"));
  const rows = [...(b?.outline ?? []), ...marks.map((m) => ({ title: m.body, page: m.page_no ?? 1, level: 0 }))]
    .filter((r) => !q || r.title.toLowerCase().includes(q)).sort((a, c) => a.page - c.page);
  const plain = notes.filter((n) => !n.tags.includes("bookmark"));
  // Up/down moves within a stage, so it is offered only in stage order and stops at the stage's ends.
  const canMove = (d: Doc, dir: -1 | 1) => {
    if (sort !== "order" || moving) return false;
    const n = ordered[ordered.indexOf(d) + dir];
    return !!n && n.stage === d.stage;
  };
  const mover = (d: Doc) => sort !== "order" ? null : (
    <span className="ws-move">
      <button className="ws-icon" title="Move up" disabled={!canMove(d, -1)} onClick={() => move(d.id, -1)}>
        <svg viewBox="0 0 20 20" aria-hidden><path d="M5 12.5 10 7l5 5.5" /></svg></button>
      <button className="ws-icon" title="Move down" disabled={!canMove(d, 1)} onClick={() => move(d.id, 1)}>
        <svg viewBox="0 0 20 20" aria-hidden><path d="M5 7.5 10 13l5-5.5" /></svg></button>
    </span>
  );

  // portalled on a phone: app/template.tsx animates a transform, which would pin a fixed sheet to the page, not the screen
  const notesPane = (
      <aside className="ws-right">
        <p className="ws-stage">Notes · {plain.length}</p>
        <div ref={notesBox} className="ws-notes" onDragOver={(e) => pick && e.preventDefault()} onDrop={(e) => { e.preventDefault(); excerpt(); }}>
          {said && <p className="ws-said" role="status">{said}</p>}
          {!b && <p className="subtle">Loading this paper.</p>}
          {b && plain.length === 0 && <p className="subtle">No notes on this paper yet.</p>}
          {plain.map((n) => <NoteCard key={n.id} n={n} on={n.id === active} here={n.page_no === page} matter={matter} doc={cur}
            hand={b?.hands?.[n.id]} onPick={() => { setActive(n.id); if (n.page_no) go(n.page_no); }} onChanged={() => reload(cur)} />)}
        </div>
        <form className="ws-add" action={async (f) => { await addAnnotation(f); reload(cur); }}>
          <input type="hidden" name="matter" value={matter} />
          <input type="hidden" name="doc" value={cur} />
          <input type="hidden" name="page" value={page} />
          <textarea name="body" required rows={2} placeholder={`Note on p. ${page}`} />
          <button className="btn small">Add note</button>
        </form>
      </aside>
  );

  return (
    <div className={`ws${panes.left ? "" : " no-left"}${panes.right ? "" : " no-right"}`}>
      <aside className="ws-left">
        <label className="ws-split"><input type="checkbox" checked={split} onChange={(e) => pickSplit(e.target.checked)} /> Papers and filters</label>
        {!split ? (
          <ul className="ws-list">
            {files.map(([f, ds]) => (
              <li key={f} className="ws-doc"><div className="ws-docrow">
                <button aria-current={f === file ? "page" : undefined} onClick={() => goDoc(ds.reduce((a, c) => (c.from < a.from ? c : a)).id)}>
                  <span>{f}</span><span className="subtle">{ds.reduce((n, d) => n + d.pages, 0)} pp.</span>
                </button>
              </div></li>
            ))}
          </ul>
        ) : <>
        <div className="ws-toggle" role="tablist">
          <button role="tab" aria-selected={side === "docs"} onClick={() => setSide("docs")}>Documents</button>
          <button role="tab" aria-selected={side === "outline"} onClick={() => setSide("outline")}>Outline</button>
        </div>
        <div className="ws-find">
          <input className="ws-filter" placeholder={side === "docs" ? "Filter documents" : "Filter outline"} value={filter} onChange={(e) => setFilter(e.target.value)} />
          {side === "docs" && (
            <select className="ws-sort" aria-label="Sort documents" value={sort} onChange={(e) => pickSort(e.target.value as Sort)}>
              {SORTS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          )}
        </div>
        {side === "docs" ? (
          <ul className="ws-list">
            {shownDocs.map((d, i) => (
              <li key={d.id} className="ws-doc">
                {sort === "order" && (i === 0 || shownDocs[i - 1].stage !== d.stage) && <p className="ws-stage">{d.stage}</p>}
                <div className="ws-docrow">
                  <button aria-current={d.id === cur ? "page" : undefined} onClick={() => goDoc(d.id)}>
                    <span>{d.title}</span><span className="subtle">{d.pages} pp.</span>
                  </button>
                  {mover(d)}
                </div>
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
          <summary>Source files <span className="subtle">{sources.length}</span></summary>
          <ul className="plain">
            {sources.map((s) => (
              <li key={s.key}>
                <span>{s.file}</span>
                <span className="subtle">{s.how} {s.when}{s.pages ? ` · ${s.pages} pp.` : ""}{s.status !== "done" ? ` · ${s.status}` : ""}</span>
                {s.doc && <button className="subtle linkish" onClick={() => goDoc(s.doc!)}>Open</button>}
              </li>
            ))}
          </ul>
        </details>
        </>}
      </aside>

      <section className="ws-mid">
        <header className="ws-bar">
          <button className="ws-icon" aria-pressed={panes.left} title="Documents and outline  [" onClick={() => setPanes((x) => ({ ...x, left: !x.left }))}>
            <svg viewBox="0 0 20 20" aria-hidden><rect x="2.5" y="3.5" width="15" height="13" rx="2" /><path d="M7.5 3.5v13" /></svg></button>
          <div className="ws-title">
            <strong>{doc.title}</strong>
            <span className="subtle" title={doc.origin}>{doc.origin}</span>
          </div>
          <div className="ws-tools">
            <button className="ws-icon" title="Previous paper" disabled={ordered[0]?.id === cur} onClick={() => goDoc(ordered[ordered.findIndex((d) => d.id === cur) - 1].id)}>
              <svg viewBox="0 0 20 20" aria-hidden><path d="M5 12.5 10 7l5 5.5M5 7h10" /></svg></button>
            <button className="ws-icon" title="Previous page" disabled={page <= 1} onClick={() => go(clamp(page - 1))}>
              <svg viewBox="0 0 20 20" aria-hidden><path d="M12.5 4.5 7 10l5.5 5.5" /></svg></button>
            <label className="ws-page"><input inputMode="numeric" aria-label="Page" value={typed ?? page}
              onChange={(e) => setTyped(e.target.value)} onBlur={() => setTyped(null)}
              onKeyDown={(e) => { if (e.key === "Enter") { const n = Number(typed); if (Number.isInteger(n)) go(clamp(n)); setTyped(null); (e.target as HTMLInputElement).blur(); } }} />
              <span className="subtle">of {doc.pages}</span></label>
            <button className="ws-icon" title="Next page" disabled={page >= doc.pages} onClick={() => go(clamp(page + 1))}>
              <svg viewBox="0 0 20 20" aria-hidden><path d="M7.5 4.5 13 10l-5.5 5.5" /></svg></button>
            <button className="ws-icon" title="Next paper" disabled={ordered.at(-1)?.id === cur} onClick={() => goDoc(ordered[ordered.findIndex((d) => d.id === cur) + 1].id)}>
              <svg viewBox="0 0 20 20" aria-hidden><path d="M5 7.5 10 13l5-5.5M5 13h10" /></svg></button>
            <span className="ws-sep" />
            <button className="ws-icon" title="Zoom out  -" onClick={() => setZoom((z) => Math.max(z - 15, 55))}>
              <svg viewBox="0 0 20 20" aria-hidden><path d="M5 10h10" /></svg></button>
            <button className="ws-zoom" title="Fit width" onClick={() => setZoom(100)}>{zoom}%</button>
            <button className="ws-icon" title="Zoom in  +" onClick={() => setZoom((z) => Math.min(z + 15, 200))}>
              <svg viewBox="0 0 20 20" aria-hidden><path d="M5 10h10M10 5v10" /></svg></button>
            <span className="ws-sep" />
            <button className="ws-icon" aria-pressed={squeeze} title="Only the marked pages" onClick={() => setSqueeze(!squeeze)}>
              <svg viewBox="0 0 20 20" aria-hidden><path d="M4 3.5h12M4 16.5h12M10 6v3M10 14v-3M7.5 7.5 10 9.5l2.5-2M7.5 12.5 10 10.5l2.5 2" /></svg></button>
            <Link className="ws-icon" title="Open this page in the reader" href={`/m/${matter}/d/${cur}?p=${page}`}>
              <svg viewBox="0 0 20 20" aria-hidden><path d="M8 4H4.5v11.5H16V12M11 4h5v5M16 4l-7 7" /></svg></Link>
          </div>
          <button className="ws-icon" aria-pressed={panes.right} title="Notes  ]" onClick={() => setPanes((x) => ({ ...x, right: !x.right }))}>
            <svg viewBox="0 0 20 20" aria-hidden><rect x="2.5" y="3.5" width="15" height="13" rx="2" /><path d="M12.5 3.5v13" /></svg></button>
        </header>
        <div ref={reader} className="ws-pages" style={{ "--zoom": zoom / 100 } as React.CSSProperties}>
          {ordered.map((d) => {
            const x = cache[d.id], folded = shut(d.id), mk = markedOf(x);
            return (
              <section key={d.id} data-doc={d.id} data-open={folded ? undefined : ""} className="ws-paper">
                <header className="ws-paperhead">
                  {split && <button className="ws-icon" aria-expanded={!folded} title={folded ? "Show pages" : "Fold pages"}
                    onClick={() => setOpen((f) => { const n = new Set(f); if (folded) n.add(d.id); else n.delete(d.id); return n; })}>
                    <svg viewBox="0 0 20 20" aria-hidden><path d={folded ? "M7.5 5 13 10l-5.5 5" : "M5 7.5 10 13l5-5.5"} /></svg></button>}
                  <span className="ws-papertitle"><strong>{d.title}</strong><span className="subtle">{d.stage} · {d.pages} pp.</span></span>
                  {split && mover(d)}
                </header>
                {!folded && Array.from({ length: d.pages }, (_, i) => (
                  <figure key={i} hidden={squeeze && !!x && !mk.has(i + 1)} data-page={i + 1}
                    className={d.id === cur && notes.some((n) => n.id === active && n.page_no === i + 1) ? "lit" : ""}>
                    <span className="ws-pno">P {i + 1}</span>
                    {x?.scans[i]
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={x.scans[i]} alt={`${d.title}, page ${i + 1}`} loading="lazy" width={850} height={1100} />
                      : <div className="ws-blank" />}
                    {x?.ink.filter((h) => h.page === i + 1).flatMap((h, k) => h.rects.map(([l, t, w, hh], j) => (
                      <span key={`${k}-${j}`} className="ws-hl" style={{ left: `${l * 100}%`, top: `${t * 100}%`, width: `${w * 100}%`, height: `${hh * 100}%`, background: h.color ?? undefined }} />
                    )))}
                    {x?.words[i] && <PageText url={x.words[i]} />}
                  </figure>
                ))}
              </section>
            );
          })}
        </div>
      </section>

      {phone ? panes.right && createPortal(notesPane, document.body) : notesPane}

      {pick && createPortal(
        <button className="btn small ws-pick" style={{ left: pick.x, top: pick.y + 6 }} onMouseDown={(e) => e.preventDefault()} onClick={excerpt}>Excerpt</button>,
        document.body
      )}
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


// One card in the notes column: an excerpt (verbatim quote cut from the page text), a typed note, or her handwriting
// from LiquidText. 13-10-2026 (Omkar): handwriting to text and text to handwriting. Her ink is read by a model into a
// suggestion she corrects and keeps (nothing is saved unread); a typed note can be shown in a handwriting face.
function NoteCard({ n, on, here, matter, doc, hand, onPick, onChanged }: {
  n: Note; on: boolean; here: boolean; matter: string; doc: string; hand?: string; onPick: () => void; onChanged: () => void;
}) {
  const key = `ws-hand-${n.id}`;
  const [script, setScript] = useState(false);
  const [reading, setReading] = useState<"idle" | "busy" | "done">("idle");
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { try { setScript(localStorage.getItem(key) === "1"); } catch {} }, [key]);
  const flip = () => { const v = !script; setScript(v); try { localStorage.setItem(key, v ? "1" : "0"); } catch {} };
  const read = async () => {
    setReading("busy"); setErr(null);
    const r = await readHand(matter, doc, n.id);
    if (r.error) { setErr(r.error); setReading("idle"); return; }
    setDraft(r.text ?? ""); setReading("done");
  };
  const keep = async () => { await keepHandText({ matter, doc, id: n.id, text: draft }); setReading("idle"); onChanged(); };
  const inked = n.tags.includes("handwriting");
  const kept = n.tags.includes("read-from-handwriting");
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const cls = `${n.tags.includes("excerpt") ? "ws-card" : "ws-note"}${on ? " on" : ""}${here ? " here" : ""}`;
  return (
    <article data-note={n.id} className={cls} role="button" tabIndex={0} onClick={onPick} onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && onPick()}>
      <span className="subtle">p. {n.page_no ?? "?"}</span>
      {n.tags.includes("excerpt") ? <q>{n.quote}</q> : (
        <>
          {inked && hand && <img className={`ws-ink${kept ? " small" : ""}`} src={hand} alt="Her handwritten note" loading="lazy" />}
          {(!inked || kept) && <span className={script ? "ws-script" : ""}>{n.body}</span>}
          {kept && <span className="subtle">Text read from her handwriting and kept by her</span>}
          {n.quote && <q>{n.quote.slice(0, 160)}</q>}
          <span className="ws-cardacts" onClick={stop}>
            {(!inked || kept) && <button className="linkish" onClick={flip}>{script ? "Show as type" : "Show as handwriting"}</button>}
            {inked && reading === "idle" && <button className="linkish" onClick={read}>{kept ? "Read again" : "Read handwriting"}</button>}
            {reading === "busy" && <span className="subtle">Reading</span>}
          </span>
          {err && <span className="ws-said">{err}</span>}
          {reading === "done" && (
            <span className="ws-read" onClick={stop}>
              <span className="subtle">Check against the picture before keeping</span>
              <textarea value={draft} rows={Math.min(10, draft.split("\n").length + 1)} onChange={(e) => setDraft(e.target.value)} />
              <span className="ws-cardacts">
                <button className="btn small" disabled={!draft.trim()} onClick={keep}>Keep text</button>
                <button className="linkish" onClick={() => setReading("idle")}>Discard</button>
              </span>
            </span>
          )}
        </>
      )}
    </article>
  );
}

type Word = [number, number, number, number, string];

// 13-10-2026: the scans had no text to select, so nothing could be excerpted (the LiquidText demo). Each word is
// drawn invisibly where OCR found it; SVG textLength stretches it to the exact box, so a selection lands on the ink.
function PageText({ url }: { url: string }) {
  const box = useRef<SVGSVGElement>(null);
  const [list, setList] = useState<Word[]>([]);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      fetch(url).then((r) => (r.ok ? r.json() : [])).then(setList, () => {});
    }, { rootMargin: "800px" });
    io.observe(el);
    return () => io.disconnect();
  }, [url]);
  return (
    <svg ref={box} className="ws-text" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden>
      {list.map(([x0, y0, x1, y1, t], k) => (
        <text key={k} data-b={`${x0},${y0},${x1},${y1}`} x={x0 * 1000} y={y1 * 1000 - (y1 - y0) * 180} fontSize={(y1 - y0) * 1000}
          textLength={Math.max((x1 - x0) * 1000, 1)} lengthAdjust="spacingAndGlyphs">{t + " "}</text>
      ))}
    </svg>
  );
}
