import { createMcpHandler } from "mcp-handler";
import { emailFrom, memberMatters } from "@/lib/access";
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
  const handler = createMcpHandler((server) => register(server, { email, matters, origin }), {
    serverInfo: { name: "case-companion", version: "1.0.0" },
    instructions: RULES,
  });
  return handler(req);
}

export { handle as GET, handle as POST, handle as DELETE };
