import { Accessibility, Bell, BookOpen, KeyRound, Link2, MessageCircle, NotebookPen, Plug, ScrollText } from "lucide-react";
import { getMemory } from "@/lib/memory";
import { activity, when } from "@/lib/activity";
import Link from "next/link";
import Memory from "./Memory";
import { headers } from "next/headers";
import { tokenFor } from "@/lib/access";
import { PROMPTS } from "@/lib/mcp";
import { requireUser } from "@/lib/supabase";
import { linkedChats, startCode } from "@/lib/telegram";
import CopyButton from "../CopyButton";
import Prompts from "./Prompts";
import A11yPrefs from "@/components/A11yPrefs";
import Skills from "./Skills";
import { listSkills } from "@/lib/skills";

export const metadata = { title: "Settings · Case Companion" };

const SECTIONS = [
  ["connections", "Connections", Plug],
  ["display", "Display", Accessibility],
  ["telegram", "Telegram", MessageCircle],
  ["signin", "Sign-in link", KeyRound],
  ["notifications", "Notifications", Bell],
  ["memory", "Memory", NotebookPen],
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
  const [{ data: matters }, skills, memory] = await Promise.all([supabase.from("matters").select("id, title").order("created_at"), listSkills(), getMemory(email).catch(() => [])]);
  const recent = await activity(supabase, email, (matters ?? []).map((m) => m.id)).catch(() => []);

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
            <p className="muted" style={{ margin: 0 }}>Your papers inside Claude, ChatGPT, Codex or Cursor.</p>
            <details className="more"><summary>What they can do</summary><p>Read, search and quote the papers with page links. They answer only with receipts and say &ldquo;not found in the papers&rdquo; rather than guess. They can&apos;t change anything; a note is saved only after you say yes.</p></details>
          </div>
          <div className="card stack" style={{ gap: ".5rem" }}>
            <div className="keyline"><Link2 size={16} strokeWidth={1.75} aria-hidden /><code>{url}</code><CopyButton text={url} label="Copy link" /></div>
            <p className="subtle" style={{ margin: 0 }}>Your key. Paste it only into your own apps.</p>
          </div>
          <div className="apps">
            {apps.map((a) => (
              <article key={a.name} className="card">
                <h3>{a.name}</h3>
                {a.steps.length > 1 ? <details className="more"><summary>{a.steps.length} steps</summary><ol className="steps">{a.steps.map((s) => <li key={s}>{s}</li>)}</ol></details> : <p className="subtle" style={{ margin: 0 }}>{a.steps[0]}</p>}
                <div className="row" style={{ gap: ".5rem", marginTop: "auto" }}>
                  {a.open && <a className="btn small" style={{ flex: "0 0 auto" }} href={a.open[0]} target={a.open[0].startsWith("http") ? "_blank" : undefined} rel="noreferrer">{a.open[1]}</a>}
                  {a.copy && <CopyButton text={a.copy[0]} label={a.copy[1]} />}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="display" className="card stack">
          <h2 style={{ margin: 0 }}>Display and accessibility</h2>
          <p className="muted" style={{ margin: 0 }}>Kept on this device only.</p>
          <A11yPrefs />
        </section>

        <section id="telegram" className="card stack">
          <h2 style={{ margin: 0 }}>Telegram</h2>
          <p className="muted" style={{ margin: 0 }}>File papers and ask questions from your phone.</p>
          <details className="more"><summary>How it works</summary><p>Send a PDF or a photo of a page to @arya_case_archivebot and it is filed in the matter you pick; you hear back when it&apos;s ready. Ask in plain words, naming a paper if you like, and the answer comes with quotes, page links and the page scans.</p></details>
          <p style={{ margin: 0 }}><span className={`dot ${chats ? "on" : ""}`} aria-hidden /> {chats ? `Connected (${chats} chat${chats === 1 ? "" : "s"})` : "Not connected yet"}</p>
          <div><a className="btn" href={tgLink} target="_blank" rel="noreferrer">{chats ? "Connect another chat" : "Connect Telegram"}</a></div>
        </section>

        <section id="signin" className="card stack">
          <h2 style={{ margin: 0 }}>Sign-in link</h2>
          <p className="muted" style={{ margin: 0 }}>Bookmark it on your own devices. Anyone with it can open your workspace.</p>
          <div className="keyline"><KeyRound size={16} strokeWidth={1.75} aria-hidden /><code>{signIn}</code><CopyButton text={signIn} label="Copy link" /></div>
        </section>

        <section id="notifications" className="card stack">
          <h2 style={{ margin: 0 }}>Notifications</h2>
          <p className="muted" style={{ margin: 0 }}>An email{chats ? " and a Telegram message" : ""} when an upload is filed or fails, to {email}.</p>
        </section>

        <section id="memory" className="stack">
          <div>
            <h2>Memory</h2>
            <p className="muted" style={{ margin: 0 }}>What you ask it to remember, and where you left off.</p>
            <details className="more"><summary>How it works</summary><p>Your preferences follow you to Telegram (/remember, /memory) and your connected apps. Recent activity is kept automatically from what you open, upload, note and ask, each line dated and linked. Both guide how answers are written; facts still come only from the papers.</p></details>
          </div>
          <Memory items={memory} matters={matters ?? []} />
          {recent.length > 0 && (
            <details className="card resume-log" open>
              <summary>Recent activity, kept automatically <span>{recent.length}</span></summary>
              <ol>{recent.slice(0, 20).map((e) => <li key={e.key}>{e.link ? <Link href={e.link}>{e.text}</Link> : e.text}<time>{when(e.at)}</time></li>)}</ol>
            </details>
          )}
        </section>

        <section id="skills" className="stack">
          <div>
            <h2>Skills</h2>
            <p className="muted" style={{ margin: 0 }}>How-to instructions your connected apps follow, after asking you.</p>
          </div>
          <Skills skills={skills} />
        </section>

        <section id="prompts" className="stack">
          <div>
            <h2 style={{ marginBottom: ".25rem" }}>Prompts and skill</h2>
            <p className="muted" style={{ margin: 0 }}>Copy a prompt into a connected chat.</p>
          </div>
          <Prompts prompts={PROMPTS} matters={matters ?? []} />
          <div className="card stack">
            <h3 style={{ margin: 0 }}>Research skill</h3>
            <p className="muted" style={{ margin: 0 }}>Keeps the rules in long sessions: receipts, verified quotes, no theories.</p>
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
