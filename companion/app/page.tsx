import Link from "next/link";
import { requireUser } from "@/lib/supabase";
import { TAXONOMIES } from "@/lib/taxonomies";
import { createMatter } from "./actions";

export default async function Workspace() {
  const { supabase, user } = await requireUser();
  const [{ data: matters }, { data: staff }, { data: counts }] = await Promise.all([
    supabase.from("matters").select("id, title, kind, forum, cause").order("created_at"),
    supabase.from("app_users").select("email").maybeSingle(),
    supabase.from("documents").select("matter_id"),
  ]);
  const n = (id: string) => (counts ?? []).filter((c) => c.matter_id === id).length;

  return (
    <main className="wrap stack">
      <div>
        <p className="kicker">Workspace</p>
        <h1>Your matters</h1>
        <p className="muted">Signed in as {user.email}. Every paper you file here stays private to the matter&apos;s members.</p>
      </div>
      {!matters?.length && (
        <p className="card">No matters visible to this account yet. The owner adds you as a member of a matter.</p>
      )}
      <div className="grid2">
        {(matters ?? []).map((m) => (
          <Link key={m.id} href={`/m/${m.id}`} className="card" style={{ textDecoration: "none" }}>
            <span className="pill seal">{m.kind}</span>
            <h2 style={{ marginTop: ".5rem" }}>{m.title}</h2>
            <p className="muted" style={{ margin: 0 }}>{m.forum}</p>
            <p className="subtle">{m.cause} · {n(m.id)} papers</p>
          </Link>
        ))}
      </div>

      {staff && (
        <details className="card">
          <summary><b>New matter</b>: create a folder, then upload its PDFs</summary>
          <form action={createMatter} className="stack" style={{ marginTop: "1rem" }}>
            <label>Cause title<input type="text" name="title" required placeholder="A v. B" /></label>
            <div className="row">
              <label>Type
                <select name="kind" defaultValue="arbitration">
                  {Object.keys(TAXONOMIES).map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </label>
              <label>Forum<input type="text" name="forum" placeholder="Sole Arbitrator / Court / Commission" /></label>
              <label>Case no.<input type="text" name="cause" placeholder="as printed on the papers" /></label>
            </div>
            <p className="subtle">Names below feed cross-matter memory (e.g. &ldquo;you&apos;ve opposed this counsel before&rdquo;). One per line, as printed.</p>
            <div className="row">
              <label>Claimant / petitioner<textarea name="claimant" rows={2} /></label>
              <label>Respondent(s)<textarea name="respondent" rows={2} /></label>
            </div>
            <div className="row">
              <label>Arbitrator / presiding<textarea name="arbitrator" rows={2} /></label>
              <label>Opposing counsel<textarea name="opposing_counsel" rows={2} /></label>
            </div>
            <div><button className="btn">Create matter</button></div>
          </form>
        </details>
      )}
    </main>
  );
}
