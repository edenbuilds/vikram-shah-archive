import Link from "next/link";
import { unpin } from "@/app/actions";
import { dmyIST } from "@/lib/data";
import { getPins, reference } from "@/lib/study";
import { requireUser } from "@/lib/supabase";
import Tools from "./Tools";

// Her pinned receipts, by matter: a ready list of references (quote, paper, page) for a draft.
export default async function Pins() {
  const { supabase, user } = await requireUser();
  const [pins, { data: matters }] = await Promise.all([getPins(user.email!), supabase.from("matters").select("id, title")]);
  const visible = new Map((matters ?? []).map((m) => [m.id, m.title]));
  const groups = [...visible.entries()].map(([id, title]) => ({ id, title, pins: pins.filter((p) => p.matter === id) })).filter((g) => g.pins.length);
  const origin = "https://case-companion.edenbuilds.me";
  const md = (g: (typeof groups)[number]) => [`## ${g.title}`, "", ...g.pins.map((p, i) => `${i + 1}. "${p.quote.replace(/\s+/g, " ").trim()}" ([${p.title}, p. ${p.page}](${origin}/m/${p.matter}/d/${p.doc}?p=${p.page}))`), ""].join("\n");
  const txt = (g: (typeof groups)[number]) => g.pins.map((p, i) => `${i + 1}. ${reference(p)}`).join("\n");

  return (
    <main className="wrap stack" style={{ paddingTop: "1.5rem" }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "end" }}>
        <div>
          <h1 style={{ marginBottom: ".3rem" }}>Pinned</h1>
          <p className="muted" style={{ margin: 0 }}>Receipts you pinned from answers, briefs, comparisons, dates and search. Each is checked against its page before it is kept.</p>
        </div>
        {groups.length > 1 && <Tools text={groups.map((g) => `${g.title}\n${txt(g)}`).join("\n\n")} md={["# Pinned references", "", ...groups.map(md)].join("\n")} name="Pinned references" />}
      </div>

      {!groups.length && (
        <div className="empty">
          <h3>Nothing pinned yet</h3>
          <p>Tap <b>Pin</b> on any receipt in Ask, a brief, a comparison, the dates in the papers or search. Your pins collect here as references you can paste into a draft.</p>
          <Link className="btn" href="/search">Search your papers</Link>
        </div>
      )}

      {groups.map((g) => (
        <section key={g.id} className="card">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: ".3rem" }}>
            <h3 style={{ margin: 0 }}><Link href={`/m/${g.id}`} style={{ textDecoration: "none" }}>{g.title}</Link> <span className="subtle">{g.pins.length}</span></h3>
            <Tools text={txt(g)} md={md(g)} name={g.title.slice(0, 80)} />
          </div>
          <ol className="pins">
            {g.pins.map((p) => (
              <li key={p.id}>
                <Link href={`/m/${p.matter}/d/${p.doc}?p=${p.page}`} className="receipt bare">
                  <span><q>{p.quote}</q><cite>{p.title}, p. {p.page} →</cite></span>
                </Link>
                <form action={unpin} className="row" style={{ gap: ".6rem", alignItems: "center" }}>
                  <input type="hidden" name="id" value={p.id} />
                  <span className="subtle small-note">Pinned {dmyIST(p.at)}</span>
                  <button className="link small-note">Remove</button>
                </form>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </main>
  );
}
