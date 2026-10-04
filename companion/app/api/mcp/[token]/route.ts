import { createMcpHandler } from "mcp-handler";
import { emailFrom, memberMatters } from "@/lib/access";
import { activityNote, recentTrail } from "@/lib/activity";
import { register, RULES } from "@/lib/mcp";

export const maxDuration = 300;

// One URL per advocate: /api/mcp/<personal token>. Every client (ChatGPT, Claude, Codex,
// Cursor, VS Code) accepts a plain URL, so the token in the path is the whole install.
async function handle(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const email = emailFrom(token);
  const matters = email ? await memberMatters(email) : [];
  if (!email || !matters.length) {
    return Response.json({ error: "This Case Companion link is not valid. Copy it again from the Connect page." }, { status: 401 });
  }
  const origin = new URL(req.url).origin;
  // 04-10-2026: memory is automatic, so the app does not have to remember to call get_memory: where she left off
  // rides in the initialize reply itself, from the stored timeline (one storage read, no database queries).
  const trail = activityNote(await recentTrail(email, matters, origin, 6).catch(() => []), 6);
  const handler = createMcpHandler((server) => register(server, { email, matters, origin }), {
    serverInfo: { name: "case-companion", version: "1.0.0" },
    instructions: trail ? `${RULES}\n\n${trail}` : RULES,
  });
  return handler(req);
}

export { handle as GET, handle as POST, handle as DELETE };
