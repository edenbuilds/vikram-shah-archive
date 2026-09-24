import Link from "next/link";
import { dmy, fmtDate } from "@/lib/data";
import { db } from "@/lib/supabase";
import { TAXONOMIES, type Stage } from "@/lib/taxonomies";
import { Archive, Folder, MoreHorizontal } from "lucide-react";
import { getPrefs } from "@/lib/prefs";
import { createMatter, organiseMatter } from "./actions";
import Landing from "./Landing";

type M = { id: string; title: string; kind: string; forum: string | null; cause: string | null; stages: Stage[] };

export default async function Workspace() {
  const supabase = await db();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return <Landing />;
  const user = auth.user;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const [{ data: matters }, { data: staff }, { data: docs }, { data: notes }, { data: hearings }, prefs] = await Promise.all([
    supabase.from("matters").select("id, title, kind, forum, cause, stages").order("created_at"),
    supabase.from("app_users").select("email").maybeSingle(),
    supabase.from("documents").select("matter_id, stage, page_count"),
    supabase.from("annotations").select("matter_id"),
    supabase.from("hearings").select("id, matter_id, date, forum, purpose").eq("status", "upcoming").gte("date", today).order("date"),
    getPrefs(user.email!),
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

  // the evening before (or the day of) a hearing, offer its brief
  const tomorrow = new Date(Date.parse(today + "T00:00:00Z") + 864e5).toISOString().slice(0, 10);
  const soon = (hearings ?? []).filter((h) => h.date <= tomorrow);
  const all = (matters ?? []) as M[];
  const archived = all.filter((m) => prefs.archived.includes(m.id));
  const live = all.filter((m) => !prefs.archived.includes(m.id));
  const folderNames = [...new Set(Object.values(prefs.folders))].sort((x, y) => x.localeCompare(y));
  const groups = [...folderNames.map((f) => [f, live.filter((m) => prefs.folders[m.id] === f)] as const), ["", live.filter((m) => !prefs.folders[m.id])] as const]
    .filter(([, ms]) => ms.length);
  const card = (m: M, isArchived: boolean) => {
    const s = stat(m.id);
    const filled = m.stages.map((st) => ({ st, n: s.byStage(st.id) })).filter((x) => x.n);
    return (
      <div key={m.id} className={`matter-wrap${isArchived ? " is-archived" : ""}`}>
        <Link href={`/m/${m.id}`} className="matter-card">
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
        <details className="organise">
          <summary aria-label={`Organise ${m.title}`}><MoreHorizontal size={18} strokeWidth={1.75} aria-hidden /></summary>
          <form action={organiseMatter} className="stack" style={{ gap: ".5rem" }}>
            <input type="hidden" name="matter" value={m.id} />
            <label>Folder
              <input name="folder" list="folders" defaultValue={prefs.folders[m.id] ?? ""} placeholder="e.g. RERA appeals" />
            </label>
            <div className="row" style={{ gap: ".4rem" }}>
              <button className="btn small" name="act" value="save" style={{ flex: "0 0 auto" }}>Save</button>
              <button className="btn ghost small" name="act" value={isArchived ? "unarchive" : "archive"} style={{ flex: "0 0 auto" }}>
                {isArchived ? "Restore" : "Archive"}
              </button>
            </div>
          </form>
        </details>
      </div>
    );
  };

  return (
    <main className="wrap stack" style={{ gap: "1.5rem" }}>
      <datalist id="folders">{folderNames.map((f) => <option key={f} value={f} />)}</datalist>
      <div className="hero">
        <p className="kicker">Workspace</p>
        <h1>Your matters</h1>
        <p className="muted" style={{ margin: 0 }}>Every paper on file, searchable to the page. Private to each matter&apos;s members. Signed in as {user.email}.</p>
      </div>

      {soon.map((h) => (
        <div key={h.id} className="ask-first">
          <p>Hearing <b>{h.date === today ? "today" : h.date === tomorrow ? "tomorrow" : dmy(h.date)}</b> in <b>{all.find((m) => m.id === h.matter_id)?.title}</b>{h.purpose ? `: ${h.purpose}` : ""}. Want the one-page brief?</p>
          <Link className="btn" href={`/m/${h.matter_id}/brief`}>Open the brief</Link>
        </div>
      ))}

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
          <h3>No matters yet</h3>
          <p>Create a matter, then drop in its PDFs. Each paper is OCR&apos;d page by page, filed by stage, and becomes searchable.</p>
        </div>
      ) : (
        <>
          {groups.map(([folder, ms]) => (
            <section key={folder || "_"} className="stack" style={{ gap: ".7rem" }}>
              {groups.length > 1 && <h2 className="folder-title"><Folder size={18} strokeWidth={1.6} aria-hidden /> {folder || "Other matters"} <span className="subtle">{ms.length}</span></h2>}
              <div className="matters">{ms.map((m) => card(m, false))}</div>
            </section>
          ))}
          {!!archived.length && (
            <details className="archived">
              <summary><Archive size={16} strokeWidth={1.6} aria-hidden /> Archived <span className="subtle">{archived.length}</span></summary>
              <div className="matters" style={{ marginTop: ".8rem" }}>{archived.map((m) => card(m, true))}</div>
            </details>
          )}
        </>
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
