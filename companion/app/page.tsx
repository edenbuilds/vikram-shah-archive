import Link from "next/link";
import { fmtDate } from "@/lib/data";
import { db } from "@/lib/supabase";
import { TAXONOMIES, type Stage } from "@/lib/taxonomies";
import { createMatter } from "./actions";
import Landing from "./Landing";

type M = { id: string; title: string; kind: string; forum: string | null; cause: string | null; stages: Stage[] };

export default async function Workspace() {
  const supabase = await db();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return <Landing />;
  const user = auth.user;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const [{ data: matters }, { data: staff }, { data: docs }, { data: notes }, { data: hearings }] = await Promise.all([
    supabase.from("matters").select("id, title, kind, forum, cause, stages").order("created_at"),
    supabase.from("app_users").select("email").maybeSingle(),
    supabase.from("documents").select("matter_id, stage, page_count"),
    supabase.from("annotations").select("matter_id"),
    supabase.from("hearings").select("id, matter_id, date, forum, purpose").eq("status", "upcoming").gte("date", today).order("date"),
  ]);
  const stat = (id: string) => {
    const d = (docs ?? []).filter((x) => x.matter_id === id);
    return {
      papers: d.length,
      pages: d.reduce((a, x) => a + (x.page_count ?? 0), 0),
      notes: (notes ?? []).filter((x) => x.matter_id === id).length,
      next: (hearings ?? []).find((h) => h.matter_id === id)?.date ?? null,
      byStage: (s: string) => d.filter((x) => x.stage === s).length,
    };
  };

  return (
    <main className="wrap stack" style={{ gap: "1.5rem" }}>
      <div className="hero">
        <p className="kicker">Workspace</p>
        <h1>Your matters</h1>
        <p className="muted" style={{ margin: 0 }}>Every paper on file, searchable to the page. Private to each matter&apos;s members. Signed in as {user.email}.</p>
      </div>

      {!!hearings?.length && (
        <section className="stack" style={{ gap: ".6rem" }}>
          <h3 style={{ margin: 0 }}>Coming up</h3>
          <div className="upcoming">
            {hearings.slice(0, 6).map((h) => {
              const d = new Date(h.date + "T00:00:00");
              const m = (matters as M[] | null)?.find((x) => x.id === h.matter_id);
              return (
                <Link key={h.id} href={`/m/${h.matter_id}/hearings`}>
                  <span className="day"><b>{d.getDate()}</b><span>{d.toLocaleDateString("en-IN", { month: "short" })}</span></span>
                  <span className="what">
                    <div>{m?.title ?? h.matter_id}</div>
                    <span className="subtle">{[h.purpose, h.forum].filter(Boolean).join(" · ")}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {!matters?.length ? (
        <div className="empty">
          <div className="glyph">§</div>
          <h3>No matters yet</h3>
          <p>Create a matter, then drop in its PDFs. Each paper is OCR&apos;d page by page, filed by stage, and becomes searchable.</p>
        </div>
      ) : (
        <div className="matters">
          {(matters as M[]).map((m) => {
            const s = stat(m.id);
            const filled = m.stages.map((st) => ({ st, n: s.byStage(st.id) })).filter((x) => x.n);
            return (
              <Link key={m.id} href={`/m/${m.id}`} className="matter-card">
                <div className="row" style={{ alignItems: "center", gap: ".4rem" }}>
                  <span className="pill seal" style={{ flex: "0 0 auto" }}>{m.kind}</span>
                  {s.next && <span className="pill warn" style={{ flex: "0 0 auto" }}>Next hearing {fmtDate(s.next)}</span>}
                </div>
                <h2>{m.title}</h2>
                {m.forum && <p className="forum">{m.forum}</p>}
                {m.cause && <p className="subtle" style={{ margin: 0 }}>{m.cause}</p>}
                {s.papers > 0 && (
                  <div className="stagebar" title={filled.map((x) => `${x.st.title}: ${x.n}`).join("\n")}>
                    {filled.map((x) => <i key={x.st.id} style={{ flex: x.n, opacity: 0.35 + 0.65 * (x.n / Math.max(...filled.map((f) => f.n))) }} />)}
                  </div>
                )}
                <div className="metrics">
                  <span><b>{s.papers}</b> papers</span>
                  <span><b>{s.pages.toLocaleString("en-IN")}</b> pages</span>
                  <span><b>{s.notes}</b> notes</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {staff && (
        <details className="adder">
          <summary>＋ New matter</summary>
          <form action={createMatter} className="card stack">
            <p className="muted" style={{ margin: 0 }}>Creates a private folder with the filing tree for its type. You&apos;ll go straight to uploading its PDFs.</p>
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
            <p className="subtle" style={{ margin: 0 }}>Names feed cross-matter memory (&ldquo;you&apos;ve seen this counsel before&rdquo;). One per line, as printed. All optional.</p>
            <div className="row">
              <label>Claimant / petitioner<textarea name="claimant" rows={2} /></label>
              <label>Respondent(s)<textarea name="respondent" rows={2} /></label>
            </div>
            <div className="row">
              <label>Arbitrator / presiding<textarea name="arbitrator" rows={2} /></label>
              <label>Opposing counsel<textarea name="opposing_counsel" rows={2} /></label>
            </div>
            <div><button className="btn">Create matter and upload papers</button></div>
          </form>
        </details>
      )}
    </main>
  );
}
