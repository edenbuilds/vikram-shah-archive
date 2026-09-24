import { runAgent, type Step } from "@/lib/agent";
import { db } from "@/lib/supabase";
import { basisOf, getBrief, getComparisons, saveBrief, saveComparisons, type Section } from "@/lib/study";

export const maxDuration = 300;

// The brief's sections: each is one run of the receipts agent over the whole matter.
const SECTIONS = [
  ["listed", "What is listed next", "What does the latest notice or order in the papers list this matter for next, on what date, and what applications or issues are pending decision? Quote the notice, order or application."],
  ["stands", "Each side's stand", "What is each party's stand in this matter? For each party, state its case and the relief it seeks, from that party's own pleading, reply or application, attributed to that paper."],
  ["orders", "Orders so far", "List the orders passed in this matter so far, in date order, each with its date and what it directs, quoting the order."],
] as const;

// POST {kind: "brief" | "compare", matter, point?} -> NDJSON: {type:"step"} … {type:"done"}.
// Everything goes through her own client (RLS), then the result is saved for the matter.
export async function POST(req: Request) {
  const supabase = await db();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new Response("Sign in first", { status: 401 });
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
      try {
        const basis = await basisOf(supabase, matter);
        if (body.kind === "brief") {
          const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
          const { data: h } = await supabase.from("hearings").select("date, purpose, forum").eq("matter_id", matter).eq("status", "upcoming").gte("date", today).order("date").limit(1).maybeSingle();
          const sections: Section[] = await Promise.all(SECTIONS.map(async ([key, title, q]) => {
            const r = await runAgent(supabase, q, scope, [], (s: Step) => send({ type: "step", text: `${title}: ${s.text}` }));
            return { key, title, status: r.status, claims: r.claims, rejected: r.rejected };
          }));
          await saveBrief(matter, { made_at: new Date().toISOString(), basis, hearing: h ?? null, sections });
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
