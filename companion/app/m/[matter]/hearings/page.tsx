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
    if (!n) return null;
    return n.reviewed_by_advocate ? <span className="pill note">minutes reviewed</span> : n.draft ? <span className="pill warn">unreviewed draft</span> : <span className="pill">notes only</span>;
  };
  const group = (s: string) => (hearings ?? []).filter((h) => h.status === s);

  return (
    <div className="grid2">
      {(["upcoming", "held"] as const).map((s) => (
        <section key={s}>
          <h2>{s === "upcoming" ? "Upcoming" : "Held"}</h2>
          <ul className="plain doclist">
            {group(s).map((h) => (
              <li key={h.id}>
                <Link href={`/m/${matter}/hearings/${h.id}`}><b>{fmtDate(h.date)}</b> {h.purpose ?? ""}</Link>
                <span>{state(h.id)}</span>
              </li>
            ))}
            {!group(s).length && <li className="subtle">None.</li>}
          </ul>
        </section>
      ))}
      <form action={saveHearing} className="card stack">
        <h3>Add a hearing</h3>
        <input type="hidden" name="matter" value={matter} />
        <div className="row">
          <label>Date<input type="date" name="date" required /></label>
          <label>Status<select name="status"><option value="upcoming">upcoming</option><option value="held">held</option></select></label>
        </div>
        <label>Forum<input type="text" name="forum" /></label>
        <label>Purpose<input type="text" name="purpose" placeholder="Arguments on s.16 application" /></label>
        <div><button className="btn small">Add</button></div>
      </form>
    </div>
  );
}
