import { SideBySide } from "@/components/Claims";
import RunStudy from "@/components/RunStudy";
import { dmyIST, getMatter } from "@/lib/data";
import { printedFor } from "@/lib/printed";
import { basisOf, getComparisons, getPins, newSince } from "@/lib/study";
import { requireUser } from "@/lib/supabase";

// Compare: name a point, see what each paper says about it, side by side, with receipts.
// No verdict and no reconciling: the conclusion is hers.
export default async function Compare({ params }: { params: Promise<{ matter: string }> }) {
  const { matter } = await params;
  const { supabase, user } = await requireUser();
  const m = await getMatter(supabase, matter);
  const [list, now, pins, { data: docs }, printed] = await Promise.all([
    getComparisons(matter), basisOf(supabase, matter), getPins(user.email!),
    supabase.from("documents").select("id, title, stage").eq("matter_id", matter),
    printedFor(supabase, matter),
  ]);
  const ctx = { matter, titles: new Map((docs ?? []).map((d) => [d.id, d.title])), pinned: new Set(pins.map((p) => p.id)), printed };
  const stageOf = new Map((docs ?? []).map((d) => [d.id, d.stage]));

  return (
    <div className="stack">
      <div>
        <h2 style={{ marginBottom: ".2rem" }}>Compare</h2>
        <p className="muted" style={{ margin: 0 }}>Name a point. See what each paper says about it, side by side, each with its page. No verdict: the conclusion is yours.</p>
      </div>
      <div className="card">
        <RunStudy matter={matter} kind="compare" label="Compare" placeholder="e.g. the date possession was promised"
          suggestions={list.length ? [] : ["Relief sought", "Date of possession", "Amount paid", "Reason for the delay"]} />
      </div>

      {list.map((c) => {
        const fresh = newSince(c.basis, now);
        return (
          <section key={c.id} className="card">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
              <h3 style={{ margin: 0 }}>{c.point}</h3>
              <span className="subtle">{dmyIST(c.made_at)}</span>
            </div>
            {fresh > 0 && (
              <div className="ask-first" style={{ marginTop: ".6rem" }}>
                <p>{fresh} new paper{fresh > 1 ? "s" : ""} since this was compared. Compare again to include {fresh > 1 ? "them" : "it"}?</p>
                <RunStudy matter={matter} kind="compare" point={c.point} label="Compare again" ghost />
              </div>
            )}
            {c.status === "answered" && c.claims.length
              ? <SideBySide claims={c.claims} ctx={ctx} stageOf={stageOf} stages={m.stages} />
              : <p className="muted" style={{ margin: ".5rem 0 0" }}>The papers on file don&apos;t address this point.</p>}
          </section>
        );
      })}
    </div>
  );
}
