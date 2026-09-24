import { runAgent, type Step } from "@/lib/agent";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, emailFrom } from "@/lib/access";
import { printedFor } from "@/lib/printed";
import { buildReading, getReading, saveReading } from "@/lib/reading";
import { db } from "@/lib/supabase";
import { basisOf, buildDates, getBrief, getComparisons, getDates, getExplainer, saveBrief, saveComparisons, saveDates, saveExplainer, type Section } from "@/lib/study";

// The upload worker signs its refresh requests as this address (see worker/worker.py refresh_after).
const WORKER = "worker@case-companion";
const MADE: Record<string, (m: string) => Promise<unknown>> = { brief: getBrief, explainer: getExplainer, reading: getReading, dates: getDates };

export const maxDuration = 300;

// The brief's sections: each is one run of the receipts agent over the whole matter.
const SECTIONS = [
  ["listed", "What is listed next", "What does the latest notice or order in the papers list this matter for next, on what date, and what applications or issues are pending decision? Quote the notice, order or application."],
  ["stands", "Each side's stand", "What is each party's stand in this matter? For each party, state its case and the relief it seeks, from that party's own pleading, reply or application, attributed to that paper."],
  ["orders", "Orders so far", "List the orders passed in this matter so far, in date order, each with its date and what it directs, quoting the order."],
] as const;

// The explainer, in the shape of the one Arya's Claude made for Agile v Vikram Singh (24-09-2026):
// plain English for a first-year law student, five parts, every sentence footnoted to its page.
// Unlike that one, nothing comes from general knowledge: a term is explained only as the papers put it.
const PLAIN = "Write in plain English for a first-year law student: short sentences, and say what a legal term means only where the papers themselves say it. ";
const EXPLAINER = [
  ["kind", "What kind of case is this?", PLAIN + "Who are the parties and what is each of them (for example a developer, a flat buyer, a society, an authority)? What is the dispute about: the property, agreement, order or event at its centre? Which Acts and sections do the papers invoke? Give each point as the papers state it, attributed to the paper."],
  ["ladder", "The ladder of authorities", PLAIN + "List every court, tribunal or authority that has dealt with this matter or is asked to, from the lowest to the highest, as the papers show: its name, the provision under which the papers say it acts, what it decided or is asked to decide, with the case number and date. End with where the matter stands now, according to the latest paper."],
  ["papers", "The papers in this file", PLAIN + "Go through the kinds of paper in this matter (complaint, petition, reply, affidavit, written submissions, order, appeal memo, application, notice, exhibits). For each, say what it is, who filed or passed it, when, and what it asks for or decides in this case. One claim per paper."],
  ["story", "The story", PLAIN + "Tell what happened in this matter in date order, from the start of the parties' dealings to the latest paper. Where the parties' papers give different versions of a fact, give each version attributed to its paper, and do not say which is right."],
  ["table", "Summary table", "Build a summary table of the proceedings and key papers in this matter, oldest first. Write each row as one claim in exactly this form: 'Proceeding | What it does | Who filed or passed it | Date as printed | Outcome as the papers state it, or Pending, or Not stated'. Quote the paper for each row."],
] as const;

// POST {kind: "brief" | "explainer" | "reading" | "reading-all" | "dates" | "compare" | "keep-brief" | "keep-explainer" | "keep-reading", matter, point?}
// -> NDJSON: {type:"step"} … {type:"done"}. Everything goes through her own client (RLS), then the result is saved for the matter.
// The worker, once a matter's uploads are all filed, asks for the same kinds with {ifMade: true}, so what she
// already made is brought up to date and nothing she never asked for is made (24-09-2026: "update all the docs").
export async function POST(req: Request) {
  const worker = emailFrom(req.headers.get("authorization")?.replace(/^Bearer /, "")) === WORKER;
  const supabase: SupabaseClient = worker ? admin() : await db();
  if (!worker) {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return new Response("Sign in first", { status: 401 });
  }
  const body = await req.json();
  const matter = String(body.matter ?? "");
  const { data: m } = await supabase.from("matters").select("id").eq("id", matter).maybeSingle();
  if (!m) return new Response("No such matter", { status: 404 });
  const point = String(body.point ?? "").trim().slice(0, 300);
  if (body.kind === "compare" && !point) return new Response("Name the point to compare", { status: 400 });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(c) {
      const send = (o: unknown) => c.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      const scope = { matterIds: [matter], docIds: null };
      // each section is one run of the receipts agent over the whole matter, all at once
      const run = (list: readonly (readonly [string, string, string])[]): Promise<Section[]> => Promise.all(list.map(async ([key, title, q]) => {
        const r = await runAgent(supabase, q, scope, [], (s: Step) => send({ type: "step", text: `${title}: ${s.text}` }));
        return { key, title, status: r.status, claims: r.claims, rejected: r.rejected };
      }));
      try {
        const basis = await basisOf(supabase, matter);
        if (body.kind === "brief") {
          const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
          const { data: h } = await supabase.from("hearings").select("date, purpose, forum").eq("matter_id", matter).eq("status", "upcoming").gte("date", today).order("date").limit(1).maybeSingle();
          await saveBrief(matter, { made_at: new Date().toISOString(), basis, hearing: h ?? null, sections: await run(SECTIONS) });
        } else if (body.ifMade && MADE[body.kind] && !(await MADE[body.kind](matter))) {
          send({ type: "step", text: "Not made yet, left for her to make" });
        } else if (body.kind === "reading" || body.kind === "reading-all") {
          const r = await buildReading(supabase, matter, body.kind === "reading-all", (t) => send({ type: "step", text: t }));
          if (r.left) send({ type: "step", text: `${r.left} papers still to read; press Continue` });
        } else if (body.kind === "keep-reading") {
          const r = await getReading(matter);
          if (r) await saveReading(matter, { ...r, ack: basis });
        } else if (body.kind === "dates") {
          await Promise.all([buildDates(supabase, matter).then((d) => saveDates(matter, d)), printedFor(supabase, matter)]);
        } else if (body.kind === "explainer") {
          await saveExplainer(matter, { made_at: new Date().toISOString(), basis, sections: await run(EXPLAINER) });
        } else if (body.kind === "keep-explainer") {
          const e = await getExplainer(matter);
          if (e) await saveExplainer(matter, { ...e, ack: basis });
        } else if (body.kind === "compare") {
          const q = `On this point: "${point}". Find what each party's papers state about it. Give one claim per paper that addresses the point, ` +
            `attributed to that paper ("The complaint states…"), with its quote. Cover every side whose papers address the point. ` +
            `Do not say which is right and do not reconcile them.`;
          const r = await runAgent(supabase, q, scope, [], (s: Step) => send({ type: "step", text: s.text }));
          const prev = (await getComparisons(matter)).filter((x) => x.point.toLowerCase() !== point.toLowerCase());
          await saveComparisons(matter, [{ id: Date.now().toString(36), point, made_at: new Date().toISOString(), basis, status: r.status, claims: r.claims, rejected: r.rejected }, ...prev]);
        } else if (body.kind === "keep-brief") {
          // "Not now": keep the brief as it is for the papers on file today
          const b = await getBrief(matter);
          if (b) await saveBrief(matter, { ...b, ack: basis });
        } else throw new Error("Unknown request");
        send({ type: "done" });
      } catch (e) {
        send({ type: "error", message: (e as Error).message });
      }
      c.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
