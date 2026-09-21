import { runAgent, type Step } from "@/lib/agent";
import { db } from "@/lib/supabase";

export const maxDuration = 300;

// POST {question, thread?, matter?, sources?} -> NDJSON stream: {type:"step"} … {type:"done", thread}.
// A thread keeps the scope it started with: one matter or all matters, and optionally chosen papers.
export async function POST(req: Request) {
  const supabase = await db();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new Response("Sign in first", { status: 401 });
  const body = await req.json();
  const question = String(body.question ?? "").trim();
  if (!question) return new Response("Ask a question", { status: 400 });

  let thread: string = body.thread;
  let matter: string | null = body.matter || null;
  let sources: string[] | null = Array.isArray(body.sources) && body.sources.length ? body.sources.map(String) : null;
  const history: { q: string; a: string }[] = [];
  if (thread) {
    const { data: t } = await supabase.from("qa_threads").select("matter_id").eq("id", thread).single();
    matter = t?.matter_id ?? null;
    const { data: msgs } = await supabase.from("qa_messages").select("role, content, retrieved").eq("thread_id", thread).order("created_at");
    sources = (msgs?.[0]?.retrieved as { sources?: string[] } | null)?.sources ?? null;
    for (let i = 0; i + 1 < (msgs ?? []).length; i += 2) history.push({ q: msgs![i].content, a: msgs![i + 1].content });
  } else {
    const { data: t, error } = await supabase.from("qa_threads").insert({ matter_id: matter, title: question.slice(0, 90) }).select("id").single();
    if (error) return new Response(error.message, { status: 400 });
    thread = t.id;
  }
  const matterIds = matter ? [matter] : ((await supabase.from("matters").select("id")).data ?? []).map((m) => m.id);
  await supabase.from("qa_messages").insert({ thread_id: thread, role: "user", content: question, retrieved: { sources, matter } });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(c) {
      const send = (o: unknown) => c.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      send({ type: "thread", thread });
      try {
        const r = await runAgent(supabase, question, { matterIds, docIds: sources }, history.slice(-4), (s: Step) => send({ type: "step", ...s }));
        await supabase.from("qa_messages").insert({
          thread_id: thread, role: "assistant", status: r.status, model: r.model, citations: r.claims,
          content: r.status === "answered" ? r.claims.map((x) => x.text).join("\n") : "Not found in the papers on file.",
          retrieved: { steps: r.steps, pages: r.pagesRead, rejected: r.rejected, sources },
        });
        send({ type: "done", thread });
      } catch (e) {
        send({ type: "error", message: (e as Error).message });
      }
      c.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
