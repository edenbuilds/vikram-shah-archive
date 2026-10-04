import { getJobs } from "@/lib/jobs";
import { db } from "@/lib/supabase";

// The jobs of one matter (explainer, brief, reading order, comparison, dates), for any member's window.
// The matter is read with her own client first, so row-level security decides who may see it.
export async function GET(req: Request) {
  const matter = new URL(req.url).searchParams.get("matter") ?? "";
  const supabase = await db();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new Response("Sign in first", { status: 401 });
  const { data: m } = await supabase.from("matters").select("id").eq("id", matter).maybeSingle();
  if (!m) return Response.json([]);
  return Response.json(await getJobs(matter), { headers: { "cache-control": "no-store" } });
}
