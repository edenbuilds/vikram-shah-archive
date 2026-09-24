import Link from "next/link";
import { keepDates, rebuildDates, saveEntry } from "@/app/actions";
import PinButton from "@/components/PinButton";
import { dmy, dmyIST, getMatter } from "@/lib/data";
import { basisOf, buildDates, getDates, getPins, newSince, pinId, saveDates } from "@/lib/study";
import { requireUser } from "@/lib/supabase";
import Switch from "../Switch";

// Every date printed in the papers, oldest first, each with the words around it and its page.
// Found by reading the page text for date patterns (no model), so nothing here is inferred.
// Kept apart from her own chronology; one tap copies a date into it.
export default async function PaperDates({ params, searchParams }: { params: Promise<{ matter: string }>; searchParams: Promise<{ y?: string; q?: string }> }) {
  const { matter } = await params;
  const sp = await searchParams;
  const { supabase, user } = await requireUser();
  await getMatter(supabase, matter);
  const [saved, now, pins, { data: docs }, { data: mine }] = await Promise.all([
    getDates(matter), basisOf(supabase, matter), getPins(user.email!),
    supabase.from("documents").select("id, title").eq("matter_id", matter),
    supabase.from("chronology_entries").select("doc_id, page_no, date").eq("matter_id", matter),
  ]);
  let data = saved;
  if (!data) { data = await buildDates(supabase, matter); await saveDates(matter, data); } // first visit: gather them now
  const fresh = saved ? newSince(saved.basis, now, saved.ack) : 0;
  const title = new Map((docs ?? []).map((d) => [d.id, d.title]));
  const pinned = new Set(pins.map((p) => p.id));
  const inMine = new Set((mine ?? []).map((e) => `${e.date}|${e.doc_id}|${e.page_no}`));

  const years = [...new Map(data.dates.map((d) => [d.iso.slice(0, 4), 0])).keys()];
  const count = (y: string) => data.dates.filter((d) => d.iso.startsWith(y)).length;
  const q = (sp.q ?? "").trim().toLowerCase();
  const year = sp.y ?? (data.dates.length > 250 && !q ? years.at(-1) : undefined);
  const shown = data.dates.filter((d) => (!year || d.iso.startsWith(year)) && (!q || d.mentions.some((x) => x.quote.toLowerCase().includes(q))));

  return (
    <div className="stack">
      <Switch matter={matter} on="papers" />
      <p className="muted" style={{ margin: 0 }}>
        Every date printed in the {data.basis.papers} papers, with the words around it and the page. Read from the page text, not interpreted.
        Tap <b>Add to my chronology</b> to copy one into your own timeline.
      </p>

      {fresh > 0 && (
        <div className="ask-first">
          <p><b>{fresh} new paper{fresh > 1 ? "s" : ""}</b> since these dates were gathered on {dmyIST(data.made_at)}. Gather them again to include {fresh > 1 ? "them" : "it"}?</p>
          <div className="row" style={{ gap: ".5rem" }}>
            <form action={rebuildDates}><input type="hidden" name="matter" value={matter} /><button className="btn">Update the dates</button></form>
            <form action={keepDates}><input type="hidden" name="matter" value={matter} /><button className="btn ghost">Not now</button></form>
          </div>
        </div>
      )}

      <form className="row" style={{ alignItems: "end" }}>
        <label style={{ flex: "1 1 14rem" }}>Find words near a date<input type="search" name="q" defaultValue={sp.q} placeholder="possession, notice, order…" /></label>
        {year && <input type="hidden" name="y" value={year} />}
        <button className="btn ghost" style={{ flex: "0 0 auto" }}>Find</button>
      </form>
      <div className="chips">
        <Link className={`chip${!year ? " on" : ""}`} href={`?${new URLSearchParams({ ...(q ? { q } : {}), y: "" })}`}>All years ({data.dates.length})</Link>
        {years.map((y) => <Link key={y} className={`chip${year === y ? " on" : ""}`} href={`?${new URLSearchParams({ ...(q ? { q } : {}), y })}`}>{y} ({count(y)})</Link>)}
      </div>

      {!shown.length && <p className="muted">No dates{year ? ` in ${year}` : ""}{q ? ` near "${sp.q}"` : ""}.</p>}
      <ul className="plain chrono paper-dates">
        {shown.map((d) => (
          <li key={d.iso}>
            <div className="date">{dmy(d.iso)}</div>
            <div className="stack" style={{ gap: ".45rem" }}>
              {d.mentions.filter((x) => !q || x.quote.toLowerCase().includes(q)).map((x, i) => (
                <div key={i} className="mention">
                  <Link href={`/m/${matter}/d/${x.doc}?p=${x.page}`} className="mention-text">
                    <q>{x.quote.split(x.printed).flatMap((part, k, all) => (k < all.length - 1 ? [part, <mark key={k}>{x.printed}</mark>] : [part]))}</q>
                    <cite>{title.get(x.doc) ?? x.doc}, p. {x.page} →</cite>
                  </Link>
                  <div className="row" style={{ gap: ".4rem", flexWrap: "nowrap" }}>
                    <PinButton matter={matter} doc={x.doc} page={x.page} quote={x.quote} on={pinned.has(pinId(x.doc, x.page, x.quote))} />
                    {inMine.has(`${d.iso}|${x.doc}|${x.page}`) ? <span className="subtle small-note">In your chronology</span> : (
                      <form action={saveEntry}>
                        <input type="hidden" name="matter" value={matter} /><input type="hidden" name="date" value={d.iso} />
                        <input type="hidden" name="title" value={x.quote.slice(0, 180)} /><input type="hidden" name="doc" value={x.doc} /><input type="hidden" name="page" value={x.page} />
                        <button className="link small-note">Add to my chronology</button>
                      </form>
                    )}
                  </div>
                </div>
              ))}
              {d.more > 0 && !q && <p className="subtle" style={{ margin: 0 }}>Printed on {d.more} more page{d.more > 1 ? "s" : ""}.</p>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
