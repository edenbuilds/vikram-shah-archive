import { NextResponse } from "next/server";
import { currentUser } from "@/lib/supabase";
import { addReport, clean, deliver, getReports, newId, saveShot, type Report } from "@/lib/reports";

export const maxDuration = 30;
const PER_HOUR = 10;

// POST {kind, note, ctx, shot?} from components/Report.tsx. The screenshot is optional: a page that could not be drawn still reports.
// Signed in only (middleware also sends a stranger to /login). Replies {ok, id, mail}: the mail is sent before answering so the
// toast can say honestly whether it left; a mail that fails stays in Settings, Problems with a Resend button.
export async function POST(req: Request) {
  const { user } = await currentUser();
  if (!user?.email) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  let body: { kind?: unknown; note?: unknown; ctx?: Record<string, unknown>; shot?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Not a report" }, { status: 400 }); }
  const c = clean(body);
  if (!c.note && !c.ctx.target && typeof body.shot !== "string") return NextResponse.json({ error: "Say what went wrong" }, { status: 400 });

  const by = user.email.toLowerCase(), now = Date.now();
  if ((await getReports()).filter((r) => r.by === by && now - Date.parse(r.at) < 3_600_000).length >= PER_HOUR) return NextResponse.json({ error: "Ten reports an hour is the limit. The earlier ones are in Settings, Problems." }, { status: 429 });

  const id = newId();
  const r: Report = { id, at: new Date(now).toISOString(), by, ...c, shot: typeof body.shot === "string" ? await saveShot(id, body.shot) : null, mail: "queued", fixed: null };
  await addReport(r);
  const origin = new URL(req.url).origin;
  const mail = await Promise.race([deliver(r, origin), new Promise<Report["mail"]>((ok) => setTimeout(() => ok("queued"), 20_000))]);
  return NextResponse.json({ ok: true, id, mail });
}
