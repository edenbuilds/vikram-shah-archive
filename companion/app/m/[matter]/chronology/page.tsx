import Link from "next/link";
import { deleteEntry, moveEntry, saveEntry } from "@/app/actions";
import { fmtDate } from "@/lib/data";
import { requireUser } from "@/lib/supabase";
import Switch from "./Switch";

type Entry = { id: string; date: string | null; date_text: string | null; title: string; body: string | null; doc_id: string | null; page_no: number | null; hearing_id: string | null };
type Doc = { id: string; title: string };

export default async function Chronology({ params }: { params: Promise<{ matter: string }> }) {
  const { matter } = await params;
  const { supabase } = await requireUser();
  const [{ data: entries }, { data: docs }] = await Promise.all([
    supabase.from("chronology_entries").select("*").eq("matter_id", matter).order("date", { nullsFirst: false }).order("sort").order("created_at"),
    supabase.from("documents").select("id, title").eq("matter_id", matter).order("sort"),
  ]);
  const title = new Map(((docs ?? []) as Doc[]).map((d) => [d.id, d.title]));
  const filed = (docs ?? []).find((d) => /list[- ]of[- ]dates|chronolog/i.test(d.id + d.title));

  return (
    <div className="stack">
      <Switch matter={matter} on="mine" />
      <div>
        <h2>Working chronology</h2>
        <p className="muted">
          Your own timeline, separate from any List of Dates filed in the papers
          {filed && <> (the filed one is <Link href={`/m/${matter}/d/${filed.id}`}>{filed.title}</Link>)</>}.
          Entries linked to a paper carry a source pin. Unlinked entries are flagged as your own note.
        </p>
      </div>

      {!entries?.length && (
        <div className="empty">
          <div className="glyph">⟶</div>
          <h3>Build your working timeline</h3>
          <p>Add dates as you study the papers. Link each to the paper and page that backs it; anything unlinked stays flagged as your own note. Confirmed hearing minutes land here automatically.</p>
        </div>
      )}
      <details className="adder" open={!entries?.length}>
        <summary>＋ Add an entry</summary>
        <div className="card"><EntryForm matter={matter} docs={(docs ?? []) as Doc[]} /></div>
      </details>

      <ul className="plain chrono">
        {((entries ?? []) as Entry[]).map((e, i, all) => (
          <li key={e.id}>
            <div className="date">{e.date ? fmtDate(e.date) : e.date_text || "undated"}</div>
            <div>
              <b>{e.title}</b>
              {e.body && <div className="muted" style={{ whiteSpace: "pre-wrap" }}>{e.body}</div>}
              {e.doc_id ? (
                <Link className="pin" href={`/m/${matter}/d/${e.doc_id}${e.page_no ? `?p=${e.page_no}` : ""}`}>
                  <cite>Source: {title.get(e.doc_id) ?? e.doc_id}{e.page_no ? `, p. ${e.page_no}` : ""}</cite>
                </Link>
              ) : e.hearing_id ? (
                <Link className="pill note" href={`/m/${matter}/hearings/${e.hearing_id}`}>From minutes you reviewed</Link>
              ) : (
                <div className="note own" style={{ margin: ".4rem 0 0" }}>
                  <span className="note-label" style={{ color: "var(--warn)" }}>Advocate&apos;s own note, not sourced to a filed paper</span>
                </div>
              )}
              <details style={{ marginTop: ".4rem" }}>
                <summary className="subtle">edit</summary>
                <EntryForm matter={matter} docs={(docs ?? []) as Doc[]} e={e} />
                <form action={deleteEntry}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="matter" value={matter} /><button className="link">delete entry</button></form>
              </details>
            </div>
            <div className="row" style={{ flexWrap: "nowrap" }}>
              {(["up", "down"] as const).map((dir) => (
                <form key={dir} action={moveEntry}>
                  <input type="hidden" name="id" value={e.id} /><input type="hidden" name="matter" value={matter} /><input type="hidden" name="dir" value={dir} />
                  <button className="btn ghost small" disabled={dir === "up" ? i === 0 : i === all.length - 1} aria-label={`Move ${dir}`}>{dir === "up" ? "↑" : "↓"}</button>
                </form>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EntryForm({ matter, docs, e }: { matter: string; docs: Doc[]; e?: Entry }) {
  return (
    <form action={saveEntry} className="stack" style={{ marginTop: ".5rem" }}>
      <input type="hidden" name="matter" value={matter} />
      {e && <input type="hidden" name="id" value={e.id} />}
      <div className="row">
        <label>Date<input type="date" name="date" defaultValue={e?.date ?? ""} /></label>
        <label>or as written<input type="text" name="date_text" defaultValue={e?.date_text ?? ""} placeholder="Mar 2013 / c. 1998" /></label>
      </div>
      <label>What happened<input type="text" name="title" required defaultValue={e?.title} /></label>
      <label>Detail<textarea name="body" rows={2} defaultValue={e?.body ?? ""} /></label>
      <div className="row">
        <label>Backed by paper <span>(optional; leave empty for your own note)</span>
          <select name="doc" defaultValue={e?.doc_id ?? ""}>
            <option value="">(none, my own note)</option>
            {docs.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
          </select>
        </label>
        <label style={{ flex: "0 1 7rem" }}>Page<input type="number" name="page" min={1} defaultValue={e?.page_no ?? ""} /></label>
      </div>
      <div><button className="btn small">{e ? "Save" : "Add"}</button></div>
    </form>
  );
}
