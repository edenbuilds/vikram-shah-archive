"use client";
import { toast } from "@/components/Toast";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { deleteAnnotation } from "@/app/actions";
import type { Note } from "./Transcript";
import RubberSegment from "@/components/rb/RubberSegment";
import HoldButton from "@/components/rb/HoldButton";

export type Row = { title: string; page: number; level: number; pages?: string };
type Kind = "note" | "highlight" | "pen" | "tag";
const KINDS: [Kind, string][] = [["note", "Notes"], ["highlight", "Highlights"], ["pen", "Ink"], ["tag", "Tags"]];

// What a note is, from what the importer wrote (worker/pdf_notes.py); her own notes are "note".
export function kindOf(n: Pick<Note, "body" | "quote" | "tags">): Kind {
  if (n.body.startsWith("Pen marks in LiquidText") || n.body.startsWith("Marked in LiquidText")) return "pen";
  if (n.body.startsWith("LiquidText tag")) return "tag";
  if (n.tags.includes("highlight") || n.body === "(highlight)" || n.body.startsWith("Area highlighted") || n.body.startsWith("Highlighted in LiquidText")) return "highlight";
  return "note";
}

// 04-10-2026: modelled on how PDFgear lays out a bookmarked paper book on the phone (Omkar's
// screenshots): one sheet, Bookmarks | Annotations, title left, PDF page right, current one bold.
export default function Outline({ matter, doc, page, rows, marks, notes }: {
  matter: string; doc: string; page: number; rows: Row[]; marks: Note[]; notes: Note[];
}) {
  const sheet = useRef<HTMLDialogElement>(null);
  const inline = useRef<HTMLElement>(null);
  const [seen, setSeen] = useState(false);  // 04-10-2026: the button sat over the Download chips while the outline was already on screen
  useEffect(() => {
    const el = inline.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setSeen(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const panel = (inSheet: boolean) => <Panel matter={matter} doc={doc} page={page} rows={rows} marks={marks} notes={notes} onGo={inSheet ? () => sheet.current?.close() : undefined} />;
  return (
    <>
      <section ref={inline} className="card outline-inline">{panel(false)}</section>
      <button type="button" className={`outline-fab btn${seen ? " is-seen" : ""}`} onClick={() => sheet.current?.showModal()}>Bookmarks</button>
      <dialog ref={sheet} className="outline-sheet" onClick={(e) => { if (e.target === sheet.current) sheet.current?.close(); }}>
        <div className="sheet-grip" aria-hidden />
        {panel(true)}
        <button type="button" className="btn ghost small" style={{ width: "100%", marginTop: ".6rem" }} onClick={() => sheet.current?.close()}>Done</button>
      </dialog>
    </>
  );
}

function Panel({ matter, doc, page, rows, marks, notes, onGo }: {
  matter: string; doc: string; page: number; rows: Row[]; marks: Note[]; notes: Note[]; onGo?: () => void;
}) {
  const [tab, setTab] = useState<"bookmarks" | "annotations">("bookmarks");
  const [only, setOnly] = useState<Kind | null>(null);
  const href = (n: number) => `/m/${matter}/d/${doc}?p=${n}`;
  const here = rows.reduce((at, r, i) => (r.page <= page ? i : at), -1);  // the section the page sits in
  const sorted = [...notes].sort((a, b) => (a.page_no ?? 1e9) - (b.page_no ?? 1e9));
  const counts = Object.fromEntries(KINDS.map(([k]) => [k, sorted.filter((n) => kindOf(n) === k).length])) as Record<Kind, number>;
  const shown = only ? sorted.filter((n) => kindOf(n) === only) : sorted;

  return (
    <div className="outline">
      <RubberSegment aria-label="Bookmarks or annotations" className="seg-rb" size="sm" value={tab} onChange={(v) => setTab(v as typeof tab)}
        trackColor="var(--paper-deep)" thumbColor="var(--white)" textColor="var(--muted)" activeTextColor="var(--ink)"
        items={[{ value: "bookmarks", label: <>Bookmarks <span>{rows.length + marks.length}</span></> }, { value: "annotations", label: <>Annotations <span>{notes.length}</span></> }]} />

      {tab === "bookmarks" ? (
        <ol className="olist">
          {rows.map((r, i) => (
            <li key={`r${i}`} className={i === here ? "here" : undefined} style={r.level ? { paddingLeft: `${Math.min(r.level, 4) * 0.9}rem` } : undefined}>
              <Link href={href(r.page)} onClick={onGo}><span className="t">{r.title}</span><span className="pp">{r.page}</span></Link>
            </li>
          ))}
          {marks.length > 0 && <li className="olist-head">Bookmarked by you</li>}
          {marks.map((b) => (
            <li key={b.id} className={b.page_no === page ? "here" : undefined}>
              <Link href={href(b.page_no ?? 1)} onClick={onGo}><span className="t">{b.body}</span><span className="pp">{b.page_no}</span></Link>
              {/* hold, not tap: a stray tap in a scrolling sheet used to be enough to lose a bookmark */}
              <form action={deleteAnnotation}>
                <input type="hidden" name="id" value={b.id} /><input type="hidden" name="matter" value={matter} /><input type="hidden" name="doc" value={doc} />
                <HoldButton size="sm" className="hold-remove" holdTime={700} backgroundColor="transparent" fillColor="var(--seal)" textColor="var(--muted)" fillTextColor="var(--paper)"
                  doneLabel="Removed" onHold={() => { document.getElementById(`rm-${b.id}`)?.click(); toast("Bookmark removed"); }}>Hold to remove</HoldButton>
                <button id={`rm-${b.id}`} hidden aria-label={`Remove bookmark ${b.body}`} />
              </form>
            </li>
          ))}
        </ol>
      ) : (
        <>
          {KINDS.filter(([k]) => counts[k]).length > 1 && (
            <div className="filters">
              <button type="button" aria-pressed={!only} onClick={() => setOnly(null)}>All</button>
              {KINDS.filter(([k]) => counts[k]).map(([k, label]) => (
                <button key={k} type="button" aria-pressed={only === k} onClick={() => setOnly(only === k ? null : k)}>{label} {counts[k]}</button>
              ))}
            </div>
          )}
          {shown.length === 0 ? <p className="subtle" style={{ margin: ".6rem .2rem" }}>No notes on this paper yet. Select words in the transcript to add one.</p> : (
            <ol className="olist">
              {shown.map((n) => {
                const k = kindOf(n);
                const text = k === "pen" ? n.body.replace(/ \(.*\)$/, "") : k === "tag" ? n.body.replace(/^LiquidText tag on this document:\s*/, "") : n.quote ? `“${n.quote}”${k === "note" ? ` ${n.body}` : ""}` : n.body;
                return (
                  <li key={n.id} className={n.page_no === page ? "here" : undefined}>
                    <Link href={href(n.page_no ?? 1)} onClick={onGo}>
                      <span className="t"><span className={`kind k-${k}`}>{KINDS.find(([x]) => x === k)![1].replace(/s$/, "")}</span>{text}</span>
                      <span className="pp">{n.page_no ?? "?"}</span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}
        </>
      )}
    </div>
  );
}
