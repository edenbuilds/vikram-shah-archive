import Link from "next/link";
import CopyButton from "@/app/CopyButton";
import { Claims, SideBySide } from "@/components/Claims";
import RunStudy from "@/components/RunStudy";
import { dmy, dmyIST, getMatter } from "@/lib/data";
import { basisOf, getBrief, getPins, newSince } from "@/lib/study";
import { requireUser } from "@/lib/supabase";

// One-page hearing brief: what is listed, each side's stand, the orders so far. Every line is
// a checked quote with its page. Made on request, and remade only when she says so.
export default async function Brief({ params }: { params: Promise<{ matter: string }> }) {
  const { matter } = await params;
  const { supabase, user } = await requireUser();
  const m = await getMatter(supabase, matter);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const [brief, now, pins, { data: docs }, { data: next }] = await Promise.all([
    getBrief(matter), basisOf(supabase, matter), getPins(user.email!),
    supabase.from("documents").select("id, title, stage").eq("matter_id", matter),
    supabase.from("hearings").select("date, purpose, forum").eq("matter_id", matter).eq("status", "upcoming").gte("date", today).order("date").limit(1).maybeSingle(),
  ]);
  const ctx = { matter, titles: new Map((docs ?? []).map((d) => [d.id, d.title])), pinned: new Set(pins.map((p) => p.id)) };
  const stageOf = new Map((docs ?? []).map((d) => [d.id, d.stage]));
  const fresh = brief ? newSince(brief.basis, now, brief.ack) : 0;
  const asText = brief ? [`Hearing brief: ${m.title}`, next ? `Next hearing (your record): ${dmy(next.date)}${next.purpose ? `, ${next.purpose}` : ""}` : "", "",
    ...brief.sections.flatMap((s) => [s.title.toUpperCase(), ...(s.status === "answered" ? s.claims.flatMap((c) => [c.text, ...c.citations.map((p) => `  "${p.quote.replace(/\s+/g, " ")}" (${ctx.titles.get(p.doc_id)}, p. ${p.page_start})`)]) : ["Not found in the papers on file."]), ""])].join("\n") : "";

  return (
    <div className="stack brief">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "end" }}>
        <div>
          <h2 style={{ marginBottom: ".2rem" }}>Hearing brief</h2>
          <p className="muted" style={{ margin: 0 }}>
            {next ? <>Next hearing <b>{dmy(next.date)}</b>{next.purpose ? `, ${next.purpose}` : ""} <span className="subtle">(your record)</span></> : <>No upcoming hearing recorded. <Link href={`/m/${matter}/hearings`}>Add one</Link></>}
          </p>
        </div>
        {brief && <CopyButton text={asText} label="Copy brief" />}
      </div>

      {!brief && (
        <div className="empty">
          <h3>A one-page brief, every line with its page</h3>
          <p>What is listed next, each side&apos;s stand and the orders so far, read from the papers in this matter. Takes about a minute.</p>
          <RunStudy matter={matter} kind="brief" label="Prepare the brief" />
        </div>
      )}

      {brief && fresh > 0 && (
        <div className="ask-first">
          <p><b>{fresh} new paper{fresh > 1 ? "s" : ""}</b> {fresh > 1 ? "were" : "was"} added since this brief was made on {dmyIST(brief.made_at)}. Update the brief to include {fresh > 1 ? "them" : "it"}?</p>
          <div className="row" style={{ gap: ".5rem" }}>
            <RunStudy matter={matter} kind="brief" label="Update the brief" />
            <RunStudy matter={matter} kind="keep-brief" label="Keep this one" ghost />
          </div>
        </div>
      )}

      {brief?.sections.map((s) => (
        <section key={s.key} className="card brief-section">
          <h3>{s.title}</h3>
          {s.status !== "answered" ? <p className="muted" style={{ margin: 0 }}>Not found in the papers on file.</p>
            : s.key === "stands" ? <SideBySide claims={s.claims} ctx={ctx} stageOf={stageOf} stages={m.stages} />
            : <Claims claims={s.claims} ctx={ctx} />}
          {!!s.rejected.length && <p className="subtle" style={{ margin: ".4rem 0 0" }}>{s.rejected.length} line(s) withheld: no verbatim receipt.</p>}
        </section>
      ))}

      {brief && !fresh && (
        <div className="row subtle" style={{ alignItems: "center", gap: ".8rem" }}>
          <span>Made {dmyIST(brief.made_at)} from {brief.basis.papers} papers.</span>
          <RunStudy matter={matter} kind="brief" label="Make it again" ghost />
        </div>
      )}
    </div>
  );
}
