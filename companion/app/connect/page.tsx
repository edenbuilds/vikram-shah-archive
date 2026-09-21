import { headers } from "next/headers";
import { tokenFor } from "@/lib/access";
import { startCode } from "@/lib/telegram";
import { PROMPTS } from "@/lib/mcp";
import { requireUser } from "@/lib/supabase";
import CopyButton from "../CopyButton";
import Prompts from "./Prompts";

export const metadata = { title: "Connect AI · Case Companion" };

// Everything needed to use the papers from ChatGPT, Claude, Codex, Cursor or VS Code.
export default async function Connect() {
  const { supabase, user } = await requireUser();
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const token = tokenFor(user.email!);
  const url = `${origin}/api/mcp/${token}`;
  const signIn = `${origin}/k/${token}`;
  const { data: matters } = await supabase.from("matters").select("id, title").order("created_at");

  const cursor = `https://cursor.com/en/install-mcp?name=case-companion&config=${Buffer.from(JSON.stringify({ url })).toString("base64")}`;
  const vscode = `vscode:mcp/install?${encodeURIComponent(JSON.stringify({ name: "case-companion", type: "http", url }))}`;
  const json = JSON.stringify({ mcpServers: { "case-companion": { url } } }, null, 2);
  const apps: { name: string; steps: string[]; copy?: [string, string]; open?: [string, string] }[] = [
    { name: "Claude (web and Desktop)", open: ["https://claude.ai/settings/connectors", "Open Claude connectors"], copy: [url, "Copy URL"],
      steps: ["Add custom connector", "Name it Case Companion, paste the URL, Add", "In a chat, turn it on from the tools menu"] },
    { name: "ChatGPT", open: ["https://chatgpt.com/#settings/Connectors", "Open ChatGPT settings"], copy: [url, "Copy URL"],
      steps: ["Apps & Connectors → Advanced → turn on Developer mode", "Create: name Case Companion, paste the URL, No authentication", "In a chat, pick it under + → More"] },
    { name: "Cursor", open: [cursor, "Add to Cursor"], steps: ["One click, then Install"] },
    { name: "VS Code", open: [vscode, "Add to VS Code"], steps: ["One click, then Install"] },
    { name: "Claude Code", copy: [`claude mcp add --transport http --scope user case-companion ${url}`, "Copy command"], steps: ["Paste in Terminal"] },
    { name: "Codex (CLI and app)", copy: [`codex mcp add case-companion --url ${url}`, "Copy command"], steps: ["Paste in Terminal; the Codex app uses the same setting"] },
    { name: "Telegram", open: [`https://t.me/arya_case_archivebot?start=${startCode(user.email!)}`, "Connect Telegram"],
      steps: ["Tap, then Start", "Send files to file them; ask questions for answers with receipts"] },
    { name: "Anything else", copy: [json, "Copy config"], steps: ["Paste into the app's MCP settings (JSON)"] },
  ];

  return (
    <main className="wrap stack" style={{ gap: "1.75rem", maxWidth: "62rem" }}>
      <div>
        <h1>Connect your AI</h1>
        <p className="muted" style={{ margin: 0 }}>
          Use your papers from ChatGPT, Claude, Codex or Cursor. The AI can read, search and quote them with page links, and is told to say
          &ldquo;not found in the papers&rdquo; rather than guess. It can&apos;t change anything; it can save a note only after you say yes.
        </p>
      </div>

      <section className="card stack">
        <h3 style={{ margin: 0 }}>Your connection</h3>
        <div className="keyline"><code>{url}</code><CopyButton text={url} label="Copy URL" /></div>
        <p className="subtle" style={{ margin: 0 }}>This URL is your key to your papers. Paste it only into your own apps.</p>
      </section>

      <section className="apps">
        {apps.map((a) => (
          <article key={a.name} className="card">
            <h3>{a.name}</h3>
            <ol className="steps">{a.steps.map((s) => <li key={s}>{s}</li>)}</ol>
            <div className="row" style={{ gap: ".5rem", marginTop: "auto" }}>
              {a.open && <a className="btn small" style={{ flex: "0 0 auto" }} href={a.open[0]} target={a.open[0].startsWith("http") ? "_blank" : undefined} rel="noreferrer">{a.open[1]}</a>}
              {a.copy && <CopyButton text={a.copy[0]} label={a.copy[1]} />}
            </div>
          </article>
        ))}
      </section>

      <section className="stack">
        <div>
          <h2 style={{ marginBottom: ".25rem" }}>Research prompts</h2>
          <p className="muted" style={{ margin: 0 }}>Copy one into a connected chat. Each asks for quotes with page links and says so when the papers are silent.</p>
        </div>
        <Prompts prompts={PROMPTS} matters={matters ?? []} />
      </section>

      <section className="card stack">
        <h3 style={{ margin: 0 }}>Research skill</h3>
        <p className="muted" style={{ margin: 0 }}>The same rules as a skill, so the AI follows them even in long sessions: quote exactly, verify every quote, keep your notes apart from the record, ask before saving.</p>
        <div className="row" style={{ gap: ".5rem" }}>
          <a className="btn ghost small" style={{ flex: "0 0 auto" }} href="/skill/case-companion.zip" download>Skill for Claude (.zip)</a>
          <a className="btn ghost small" style={{ flex: "0 0 auto" }} href="/skill/case-companion/SKILL.md" download="AGENTS.md">Rules for Codex / Cursor (AGENTS.md)</a>
        </div>
        <p className="subtle" style={{ margin: 0 }}>Claude: Settings → Capabilities → Skills → Upload. Claude Code: unzip into ~/.claude/skills. Codex / Cursor: put AGENTS.md in your project folder.</p>
      </section>

      <section className="card stack">
        <h3 style={{ margin: 0 }}>Sign in without a password</h3>
        <div className="keyline"><code>{signIn}</code><CopyButton text={signIn} label="Copy link" /></div>
        <p className="subtle" style={{ margin: 0 }}>Bookmark this on your own devices. Anyone with it can open your workspace.</p>
      </section>
    </main>
  );
}
