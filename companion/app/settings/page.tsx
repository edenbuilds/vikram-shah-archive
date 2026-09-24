import { Bell, BookOpen, KeyRound, Link2, MessageCircle, Plug, ScrollText } from "lucide-react";
import { headers } from "next/headers";
import { tokenFor } from "@/lib/access";
import { PROMPTS } from "@/lib/mcp";
import { requireUser } from "@/lib/supabase";
import { linkedChats, startCode } from "@/lib/telegram";
import CopyButton from "../CopyButton";
import Prompts from "./Prompts";
import Skills from "./Skills";
import { listSkills } from "@/lib/skills";

export const metadata = { title: "Settings · Case Companion" };

const SECTIONS = [
  ["connections", "Connections", Plug],
  ["telegram", "Telegram", MessageCircle],
  ["signin", "Sign-in link", KeyRound],
  ["notifications", "Notifications", Bell],
  ["skills", "Skills", BookOpen],
  ["prompts", "Prompts and skill", ScrollText],
] as const;

export default async function Settings() {
  const { supabase, user } = await requireUser();
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const email = user.email!.toLowerCase();
  const token = tokenFor(email);
  const url = `${origin}/api/mcp/${token}`;
  const signIn = `${origin}/k/${token}`;
  const tgLink = `https://t.me/arya_case_archivebot?start=${startCode(email)}`;
  const chats = Object.entries(await linkedChats()).filter(([, e]) => e === email).length;
  const [{ data: matters }, skills] = await Promise.all([supabase.from("matters").select("id, title").order("created_at"), listSkills()]);

  const cursor = `https://cursor.com/en/install-mcp?name=case-companion&config=${Buffer.from(JSON.stringify({ url })).toString("base64")}`;
  const vscode = `vscode:mcp/install?${encodeURIComponent(JSON.stringify({ name: "case-companion", type: "http", url }))}`;
  const json = JSON.stringify({ mcpServers: { "case-companion": { url } } }, null, 2);
  const apps: { name: string; steps: string[]; copy?: [string, string]; open?: [string, string] }[] = [
    { name: "Claude (web and Desktop)", open: ["https://claude.ai/settings/connectors", "Open Claude"], copy: [url, "Copy link"],
      steps: ["Add custom connector", "Name it Case Companion, paste the link, Add"] },
    { name: "ChatGPT", open: ["https://chatgpt.com/#settings/Connectors", "Open ChatGPT"], copy: [url, "Copy link"],
      steps: ["Apps & Connectors, Advanced, turn on Developer mode", "Create: paste the link, No authentication"] },
    { name: "Cursor", open: [cursor, "Add to Cursor"], steps: ["One click, then Install"] },
    { name: "VS Code", open: [vscode, "Add to VS Code"], steps: ["One click, then Install"] },
    { name: "Claude Code", copy: [`claude mcp add --transport http --scope user case-companion ${url}`, "Copy command"], steps: ["Paste in Terminal"] },
    { name: "Codex", copy: [`codex mcp add case-companion --url ${url}`, "Copy command"], steps: ["Paste in Terminal; the Codex app uses it too"] },
    { name: "Any other app", copy: [json, "Copy config"], steps: ["Paste into its MCP settings"] },
  ];

  return (
    <main className="wrap settings">
      <nav className="settings-nav" aria-label="Settings">
        <h1>Settings</h1>
        {SECTIONS.map(([id, label, Icon]) => <a key={id} href={`#${id}`}><Icon size={16} strokeWidth={1.75} aria-hidden /> {label}</a>)}
      </nav>

      <div className="stack" style={{ gap: "2.25rem" }}>
        <section id="connections" className="stack">
          <div>
            <h2>Connections</h2>
            <p className="muted" style={{ margin: 0 }}>Use your papers from ChatGPT, Claude, Codex or Cursor. They can read, search and quote the papers with page links, and are told to answer only with receipts and to say &ldquo;not found in the papers&rdquo; rather than guess. They can&apos;t change anything; a note is saved only after you say yes.</p>
          </div>
          <div className="card stack" style={{ gap: ".5rem" }}>
            <div className="keyline"><Link2 size={16} strokeWidth={1.75} aria-hidden /><code>{url}</code><CopyButton text={url} label="Copy link" /></div>
            <p className="subtle" style={{ margin: 0 }}>This link is your key to your papers. Paste it only into your own apps.</p>
          </div>
          <div className="apps">
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
          </div>
        </section>

        <section id="telegram" className="card stack">
          <h2 style={{ margin: 0 }}>Telegram</h2>
          <p className="muted" style={{ margin: 0 }}>
            Send a PDF or a photo of a page to @arya_case_archivebot and it is filed in the matter you pick; you hear back when it&apos;s ready.
            Ask a question in plain words, naming a paper if you like, and the answer comes with quotes, page links and the page scans.
          </p>
          <p style={{ margin: 0 }}><span className={`dot ${chats ? "on" : ""}`} aria-hidden /> {chats ? `Connected (${chats} chat${chats === 1 ? "" : "s"})` : "Not connected yet"}</p>
          <div><a className="btn" href={tgLink} target="_blank" rel="noreferrer">{chats ? "Connect another chat" : "Connect Telegram"}</a></div>
        </section>

        <section id="signin" className="card stack">
          <h2 style={{ margin: 0 }}>Sign-in link</h2>
          <p className="muted" style={{ margin: 0 }}>No password. Bookmark this on your own devices; anyone with it can open your workspace. You can also get a fresh link any time from the sign-in page.</p>
          <div className="keyline"><KeyRound size={16} strokeWidth={1.75} aria-hidden /><code>{signIn}</code><CopyButton text={signIn} label="Copy link" /></div>
        </section>

        <section id="notifications" className="card stack">
          <h2 style={{ margin: 0 }}>Notifications</h2>
          <p className="muted" style={{ margin: 0 }}>When an upload is read and filed, or fails, the people with access to that matter get an email{chats ? " and a Telegram message" : ""}. Emails go to {email}.</p>
        </section>

        <section id="skills" className="stack">
          <div>
            <h2>Skills</h2>
            <p className="muted" style={{ margin: 0 }}>How-to instructions your connected apps can follow, such as a drafting style or a reading order. They ask you before using one, and every fact still comes from the papers.</p>
          </div>
          <Skills skills={skills} />
        </section>

        <section id="prompts" className="stack">
          <div>
            <h2 style={{ marginBottom: ".25rem" }}>Prompts and skill</h2>
            <p className="muted" style={{ margin: 0 }}>Copy a prompt into a connected chat. Each asks for quotes with page links and says so when the papers are silent.</p>
          </div>
          <Prompts prompts={PROMPTS} matters={matters ?? []} />
          <div className="card stack">
            <h3 style={{ margin: 0 }}>Research skill</h3>
            <p className="muted" style={{ margin: 0 }}>The same rules, so the model keeps to them in long sessions: a receipt for every statement, every quote verified, no theories.</p>
            <div className="row" style={{ gap: ".5rem" }}>
              <a className="btn ghost small" style={{ flex: "0 0 auto" }} href="/skill/case-companion.zip" download>Skill for Claude (.zip)</a>
              <a className="btn ghost small" style={{ flex: "0 0 auto" }} href="/skill/case-companion/SKILL.md" download="AGENTS.md">AGENTS.md for Codex and Cursor</a>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
