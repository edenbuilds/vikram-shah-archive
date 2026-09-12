import Link from "next/link";
import { notFound } from "next/navigation";
import { confirmMinutes, draftFromNotes, saveHearing, saveNotes } from "@/app/actions";
import Submit from "@/app/Submit";
import { fmtDate, getMatter, isApplicationStage } from "@/lib/data";
import type { Item, Minutes } from "@/lib/minutes";
import { requireUser } from "@/lib/supabase";

type Draft = Minutes & { dropped?: { field: string; text: string }[] };

export default async function Hearing({ params }: { params: Promise<{ matter: string; id: string }> }) {
  const { matter, id } = await params;
  const { supabase } = await requireUser();
  const m = await getMatter(supabase, matter);
  const { data: h } = await supabase.from("hearings").select("*").eq("id", id).eq("matter_id", matter).maybeSingle();
  if (!h) notFound();
  const [{ data: n }, { data: minuteDocs }] = await Promise.all([
    supabase.from("hearing_notes").select("*").eq("hearing_id", id).maybeSingle(),
    supabase.from("documents").select("id, title").eq("matter_id", matter).order("sort"),
  ]);
  const draft = n?.draft as Draft | null;
  const lines = (xs?: Item[]) => (xs ?? []).map((x) => x.text).join("\n");

  return (
    <div className="stack">
      <nav className="subtle"><Link href={`/m/${matter}/hearings`}>Hearings</Link> / {fmtDate(h.date)}</nav>
      <h2>Hearing of {fmtDate(h.date)} <span className={`pill ${h.status === "held" ? "" : "seal"}`}>{h.status}</span></h2>

      <div className="reader">
        <div className="stack">
          <form action={saveNotes} className="card stack">
            <h3>Raw notes <span className="subtle">(typed during or right after the hearing)</span></h3>
            <input type="hidden" name="matter" value={matter} /><input type="hidden" name="hearing" value={id} />
            <textarea name="raw" rows={10} defaultValue={n?.raw ?? ""} placeholder={"Appeared: ...\nTribunal directed ...\nNext date ..."} />
            <div className="row" style={{ alignItems: "center" }}>
              <Submit pending="Saving…" className="btn small">Save notes</Submit>
              <span className="subtle">Saving re-opens review of the minutes.</span>
            </div>
          </form>

          {n?.raw && (
            <form action={draftFromNotes}>
              <input type="hidden" name="matter" value={matter} /><input type="hidden" name="hearing" value={id} />
              <Submit pending="Drafting from your notes…" className="btn ghost">Draft minutes from these notes (editorial assist)</Submit>
            </form>
          )}

          {draft && (
            <section className={n?.reviewed_by_advocate ? "card" : "card refusal"}>
              <p className="assist-label">
                {n?.reviewed_by_advocate
                  ? `Minutes of proceedings: reviewed by advocate ${n.reviewed_at ? new Date(n.reviewed_at).toLocaleString("en-IN") : ""}`
                  : "Unreviewed draft: not final, not fed to the chronology or Q&A until you confirm"}
              </p>
              {(["attendees", "orders", "action_items"] as const).map((k) => (
                <div key={k}>
                  <h3 style={{ marginTop: ".75rem" }}>{k.replace("_", " ")}</h3>
                  <ul>
                    {(draft[k] ?? []).map((it, i) => (
                      <li key={i}>{it.text}{it.source_quote && <div className="subtle">from your notes: &ldquo;{it.source_quote}&rdquo;</div>}</li>
                    ))}
                    {!draft[k]?.length && <li className="subtle">nothing in the notes</li>}
                  </ul>
                </div>
              ))}
              <h3>next date</h3>
              <p>{draft.next_date ? `${draft.next_date.text}${draft.next_date.iso ? ` (${draft.next_date.iso})` : " (no full date written)"}` : <span className="subtle">none in the notes</span>}</p>
              {!!draft.dropped?.length && (
                <details><summary className="subtle">{draft.dropped.length} drafted item(s) withheld: not traceable to your notes</summary>
                  <ul>{draft.dropped.map((d, i) => <li key={i} className="subtle">{d.field}: {d.text}</li>)}</ul>
                </details>
              )}
            </section>
          )}

          {draft && (
            <form action={confirmMinutes} className="card stack">
              <h3>{n?.reviewed_by_advocate ? "Edit reviewed minutes" : "Review and confirm"}</h3>
              <p className="subtle">Edit anything; one item per line. Confirming marks the hearing held, adds the orders to your chronology, and creates the next hearing.</p>
              <input type="hidden" name="matter" value={matter} /><input type="hidden" name="hearing" value={id} />
              <label>Attendees<textarea name="attendees" rows={3} defaultValue={lines(draft.attendees)} /></label>
              <label>Orders passed<textarea name="orders" rows={4} defaultValue={lines(draft.orders)} /></label>
              <label>Action items<textarea name="action_items" rows={3} defaultValue={lines(draft.action_items)} /></label>
              <label>Next date<input type="date" name="next_date" defaultValue={draft.next_date?.iso ?? ""} /></label>
              <div><Submit pending="Confirming…">I have reviewed these minutes</Submit></div>
            </form>
          )}
        </div>

        <aside className="rail">
          {h.status === "upcoming" && <PrepBrief matter={m} hearing={h} />}
          <details className="card">
            <summary>Hearing details</summary>
            <form action={saveHearing} className="stack" style={{ marginTop: ".6rem" }}>
              <input type="hidden" name="matter" value={matter} /><input type="hidden" name="id" value={id} />
              <label>Date<input type="date" name="date" defaultValue={h.date} required /></label>
              <label>Status<select name="status" defaultValue={h.status}><option>upcoming</option><option>held</option></select></label>
              <label>Forum<input type="text" name="forum" defaultValue={h.forum ?? ""} /></label>
              <label>Purpose<input type="text" name="purpose" defaultValue={h.purpose ?? ""} /></label>
              <label>Filed minutes paper
                <select name="minutes_doc" defaultValue={h.minutes_doc_id ?? ""}>
                  <option value="">(not filed yet)</option>
                  {(minuteDocs ?? []).map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
                </select>
              </label>
              <button className="btn small">Save</button>
            </form>
          </details>
        </aside>
      </div>
    </div>
  );
}

// A compiled view of existing records only: no synthesis, no recommendations.
async function PrepBrief({ matter: m, hearing: h }: { matter: Awaited<ReturnType<typeof getMatter>>; hearing: { id: string; date: string } }) {
  const { supabase } = await requireUser();
  const appStages = m.stages.filter(isApplicationStage).map((s) => s.id);
  const [{ data: chrono }, { data: apps }, { data: lastHeld }, { data: cols }, { data: statusNotes }] = await Promise.all([
    supabase.from("chronology_entries").select("id, date, date_text, title, doc_id").eq("matter_id", m.id)
      .or(`date.lte.${h.date},date.is.null`).order("date", { ascending: false, nullsFirst: false }).limit(12),
    supabase.from("documents").select("id, title, stage").eq("matter_id", m.id).in("stage", appStages.length ? appStages : ["-"]).order("sort"),
    supabase.from("hearings").select("id, date, hearing_notes(draft, reviewed_by_advocate)").eq("matter_id", m.id).eq("status", "held")
      .lt("date", h.date).order("date", { ascending: false }).limit(1),
    supabase.from("collections").select("id, title, collection_items(doc_id, page_no, note)").eq("hearing_id", h.id),
    supabase.from("annotations").select("doc_id, body, tags").eq("matter_id", m.id).overlaps("tags", ["status", "open", "pending", "next-hearing"]),
  ]);
  const last = lastHeld?.[0] as { id: string; date: string; hearing_notes: { draft: Minutes | null; reviewed_by_advocate: boolean }[] | { draft: Minutes | null; reviewed_by_advocate: boolean } | null } | undefined;
  const ln = Array.isArray(last?.hearing_notes) ? last?.hearing_notes[0] : last?.hearing_notes;
  const noteFor = (doc: string) => (statusNotes ?? []).filter((a) => a.doc_id === doc);

  return (
    <section className="card stack">
      <div>
        <p className="assist-label">Prep brief: compiled from your records, no new analysis</p>
        <h3>For {fmtDate(h.date)}</h3>
      </div>
      <div>
        <h3>Last order passed</h3>
        {last && ln?.reviewed_by_advocate && ln.draft?.orders?.length ? (
          <ul>{ln.draft.orders.map((o, i) => <li key={i}>{o.text}</li>)}<li className="subtle">per your reviewed minutes of <Link href={`/m/${m.id}/hearings/${last.id}`}>{fmtDate(last.date)}</Link></li></ul>
        ) : <p className="subtle">No reviewed minutes before this date. Check the Minutes stage in the filing tree.</p>}
      </div>
      <div>
        <h3>Applications on file</h3>
        <ul className="plain">
          {(apps ?? []).map((a) => (
            <li key={a.id} style={{ marginBottom: ".35rem" }}>
              <Link href={`/m/${m.id}/d/${a.id}`}>{a.title}</Link>
              {noteFor(a.id).length
                ? noteFor(a.id).map((n, i) => <div key={i} className="note" style={{ margin: ".2rem 0" }}><span className="note-label">Your status note</span>{n.body}</div>)
                : <div className="subtle">status: not recorded (tag a note &ldquo;status&rdquo; on the paper)</div>}
            </li>
          ))}
          {!apps?.length && <li className="subtle">None filed under application stages.</li>}
        </ul>
      </div>
      <div>
        <h3>Chronology to date</h3>
        <ul className="plain">{(chrono ?? []).map((c) => <li key={c.id}><span className="mono">{c.date ? fmtDate(c.date) : c.date_text}</span> {c.title}{!c.doc_id && <span className="pill warn" style={{ marginLeft: ".3rem" }}>own note</span>}</li>)}</ul>
      </div>
      <div>
        <h3>Collections for this hearing</h3>
        {(cols ?? []).map((c) => <p key={c.id}><Link href={`/m/${m.id}/collections#${c.id}`}>{c.title}</Link> <span className="subtle">({(c.collection_items as unknown[]).length} papers)</span></p>)}
        {!cols?.length && <p className="subtle">None linked. Link one from Collections.</p>}
      </div>
    </section>
  );
}
