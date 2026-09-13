import Link from "next/link";
import { saveHearing } from "@/app/actions";
import { fmtDate } from "@/lib/data";
import { requireUser } from "@/lib/supabase";

export default async function Hearings({ params }: { params: Promise<{ matter: string }> }) {
  const { matter } = await params;
  const { supabase } = await requireUser();
  const [{ data: hearings }, { data: notes }] = await Promise.all([
    supabase.from("hearings").select("id, date, forum, purpose, status").eq("matter_id", matter).order("date", { ascending: false }),
    supabase.from("hearing_notes").select("hearing_id, reviewed_by_advocate, draft").eq("matter_id", matter),
  ]);
  const state = (id: string) => {
    const n = (notes ?? []).find((x) => x.hearing_id === id);
    if (!n) return <span className="pill">no notes yet</span>;
    return n.reviewed_by_advocate ? <span className="pill ok">minutes reviewed</span> : n.draft ? <span className="pill warn">draft to review</span> : <span className="pill">notes only</span>;
  };
  const group = (s: string) => (hearings ?? []).filter((h) => h.status === s);
  const upcoming = group("upcoming").reverse();

  return (
    <div className="stack" style={{ gap: "1.25rem" }}>
      {!hearings?.length && (
        <div className="empty">
          <div className="glyph">⚖</div>
          <h3>No hearings yet</h3>
          <p>Add the next date. During or after the hearing, type your notes; the app drafts the Minutes of Proceedings from them for you to review. Upcoming hearings get a prep brief compiled from your records.</p>
        </div>
      )}
      <details className="adder" open={!hearings?.length}>
        <summary>＋ Add a hearing</summary>
        <form action={saveHearing} className="card stack">
          <input type="hidden" name="matter" value={matter} />
          <div className="row">
            <label>Date<input type="date" name="date" required /></label>
            <label>Status<select name="status"><option value="upcoming">upcoming</option><option value="held">held</option></select></label>
            <label>Forum<input type="text" name="forum" /></label>
          </div>
          <label>Purpose<input type="text" name="purpose" placeholder="Arguments on s.16 application" /></label>
          <div><button className="btn small">Add hearing</button></div>
        </form>
      </details>

      {!!hearings?.length && (
        <div className="grid2">
          {([["Upcoming", upcoming], ["Held", group("held")]] as const).map(([label, list]) => (
            <section key={label} className="stage-card">
              <header><h2>{label}</h2><span className="subtle">{list.length}</span></header>
              {list.map((h) => (
                <Link key={h.id} href={`/m/${matter}/hearings/${h.id}`} className="docrow">
                  <span className="dt"><b style={{ fontFamily: "var(--mono)", fontSize: ".85rem", color: "var(--seal)" }}>{fmtDate(h.date)}</b><br />{h.purpose ?? h.forum ?? "Hearing"}</span>
                  <span className="meta">{state(h.id)}</span>
                </Link>
              ))}
              {!list.length && <p className="subtle" style={{ padding: ".8rem 1.1rem", margin: 0 }}>None.</p>}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
