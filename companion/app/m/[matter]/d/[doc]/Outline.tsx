"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { deleteAnnotation } from "@/app/actions";
import type { Note } from "./Transcript";

export type Row = { title: string; page: number; level: number; pages?: string };
type Kind = "note" | "highlight" | "pen" | "tag";
const KINDS: [Kind, string][] = [["note", "Notes"], ["highlight", "Highlights"], ["pen", "Pen marks"], ["tag", "Tags"]];

// What a note is, from what the importer wrote (worker/pdf_notes.py); her own notes are "note".
export function kindOf(n: Pick<Note, "body" | "quote" | "tags">): Kind {
  if (n.body.startsWith("Pen marks in LiquidText")) return "pen";
  if (n.body.startsWith("LiquidText tag")) return "tag";
  if (n.body === "(highlight)" || n.body.startsWith("Area highlighted")) return "highlight";
  return "note";
}

// 04-10-2026: modelled on how PDFgear lays out a bookmarked paper book on the phone (Omkar's
// screenshots): one sheet, Bookmarks | Annotations, title left, PDF page right, current one bold.
export default function Outline({ matter, doc, page, rows, marks, notes }: {
  matter: string; doc: string; page: number; rows: Row[]; marks: Note[]; notes: Note[];
}) {
  const sheet = useRef<HTMLDialogElement>(null);
  const panel = (inSheet: boolean) => <Panel matter={matter} doc={doc} page={page} rows={rows} marks={marks} notes={notes} onGo={inSheet ? () => sheet.current?.close() : undefined} />;
  return (
    <>
      <section className="card outline-inline">{panel(false)}</section>
      <button type="button" className="outline-fab btn" onClick={() => sheet.current?.showModal()}>Bookmarks</button>
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
      <div className="seg" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "bookmarks"} onClick={() => setTab("bookmarks")}>Bookmarks <span>{rows.length + marks.length}</span></button>
        <button type="button" role="tab" aria-selected={tab === "annotations"} onClick={() => setTab("annotations")}>Annotations <span>{notes.length}</span></button>
      </div>

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
              <form action={deleteAnnotation}>
                <input type="hidden" name="id" value={b.id} /><input type="hidden" name="matter" value={matter} /><input type="hidden" name="doc" value={doc} />
                <button className="link subtle" aria-label={`Remove bookmark ${b.body}`}>remove</button>
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
                const text = k === "pen" ? "Pen marks" : k === "tag" ? n.body.replace(/^LiquidText tag on this document:\s*/, "") : n.quote ? `“${n.quote}”${k === "note" ? ` ${n.body}` : ""}` : n.body;
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
