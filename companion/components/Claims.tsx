import type { VerifiedClaim } from "@/lib/citations";
import { pinId } from "@/lib/study";
import Receipt from "./Receipt";

type Ctx = { matter: string; titles: Map<string, string>; pinned: Set<string> };

// Checked claims, each followed by its receipts.
export function Claims({ claims, ctx }: { claims: VerifiedClaim[]; ctx: Ctx }) {
  return (
    <>
      {claims.map((c, i) => (
        <div key={i} className="claim">
          <p style={{ margin: "0 0 .4rem" }}>{c.text}</p>
          {c.citations.map((p, j) => (
            <Receipt key={j} matter={ctx.matter} doc={p.doc_id} page={p.page_start} quote={p.quote} title={ctx.titles.get(p.doc_id) ?? p.doc_id}
              pinned={ctx.pinned.has(pinId(p.doc_id, p.page_start, p.quote.replace(/\s+/g, " ").trim()))} />
          ))}
        </div>
      ))}
    </>
  );
}

// The same claims in columns, one per stage of the paper they quote (the complaint, the reply…).
// Grouping is by where the receipt comes from, never by what the model says about sides.
export function SideBySide({ claims, ctx, stageOf, stages }: { claims: VerifiedClaim[]; ctx: Ctx; stageOf: Map<string, string>; stages: { id: string; title: string }[] }) {
  const cols = new Map<string, VerifiedClaim[]>();
  for (const c of claims) {
    const s = stageOf.get(c.citations[0]?.doc_id ?? "") ?? "other";
    cols.set(s, [...(cols.get(s) ?? []), c]);
  }
  const order = (s: string) => { const i = stages.findIndex((x) => x.id === s); return i < 0 ? 99 : i; };
  return (
    <div className="side-by-side">
      {[...cols.entries()].sort(([a], [b]) => order(a) - order(b)).map(([s, cs]) => (
        <section key={s} className="col">
          <h4>{(stages.find((x) => x.id === s)?.title ?? s).replace(/^\d+\.\s*/, "")}</h4>
          <Claims claims={cs} ctx={ctx} />
        </section>
      ))}
    </div>
  );
}
