import { Accessibility, Bell, BookOpen, Flag, KeyRound, Link2, MessageCircle, NotebookPen, Plug, ScrollText, ShieldCheck } from "lucide-react";
import { getMemory, getTrash } from "@/lib/memory";
import { editable, getControl } from "@/lib/mcp-control";
import { activity, when } from "@/lib/activity";
import Link from "next/link";

import { headers } from "next/headers";
import { tokenFor } from "@/lib/access";
import { PROMPTS } from "@/lib/mcp";
import { requireUser } from "@/lib/supabase";
import { linkedChats, startCode } from "@/lib/telegram";




import { listSkills } from "@/lib/skills";
import { buildPrompt, getReports, KINDS, parseUA, routeOf, shotUrls } from "@/lib/reports";

import { A11yPrefs, Control, CopyButton, Memory, Prompts, Reports, Skills } from "./Client";

const SECTIONS = [
  ["connections", "Connections", Plug],
  ["apps", "Connected apps", ShieldCheck],
  ["display", "Display", Accessibility],
  ["telegram", "Telegram", MessageCircle],
  ["signin", "Sign-in link", KeyRound],
  ["notifications", "Notifications", Bell],
  ["memory", "Memory", NotebookPen],
  ["skills", "Skills", BookOpen],
  ["prompts", "Prompts and skill", ScrollText],
  ["reports", "Problems", Flag],
] as const;

export const metadata = { title: "Settings" };

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
  const [control, gone] = await Promise.all([getControl(email), getTrash(email).catch(() => [])]);
  const reports = await getReports().catch(() => []), shots = await shotUrls(reports).catch(() => ({}));
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
        {SECTIONS.map(([id, label, Icon]) => <a key={id} href={`#${id}`}><Icon size={16} strokeWidth={1.75} aria-hidden /> {label}{id === "apps" && control.proposals.some((p) => p.status === "waiting") ? ` (${control.proposals.filter((p) => p.status === "waiting").length})` : ""}</a>)}
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

        <section id="apps" className="stack">
          <div>
            <h2>Connected apps</h2>
            <p className="muted" style={{ margin: 0 }}>What Claude, ChatGPT, Codex and Cursor may change in your workspace.</p>
          </div>
          <Control mode={control.mode}
            waiting={control.proposals.filter((p) => p.status === "waiting" || p.status === "failed").map((p) => ({ id: p.id, at: p.at, summary: p.summary, edit: editable(p.w), big: p.w.tool === "correct_page",
              href: p.w.tool === "add_note" || p.w.tool === "correct_page" ? `/m/${p.w.matter}/d/${p.w.doc}?p=${p.w.page}` : null, failed: p.status === "failed" ? p.error ?? "unknown error" : null }))}
            done={control.log.map((e) => ({ id: e.id, at: e.at, via: e.via, summary: e.summary, canUndo: !!e.undo, undone: e.undone }))}
            gone={gone.map((g) => ({ id: g.id, text: g.text, gone: g.gone }))} />
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
            <p className="muted" style={{ margin: 0 }}>Kept automatically from what you and your connected apps do. Nothing to switch on.</p>
            <details className="more"><summary>How it works</summary><p>Every paper you open, upload, note, ask about or edit, and every paper a connected app reads, is written down with its date and link, and handed to the app when it connects. It guides where answers start; facts still come only from the papers. Anything you add under &ldquo;Your own reminders&rdquo; follows you to Telegram (/remember, /memory) and your apps too.</p></details>
          </div>
          {recent.length > 0 ? (
            <div className="card resume-log">
              <ol>{recent.slice(0, 25).map((e) => <li key={e.key}>{e.link ? <Link href={e.link}>{e.text}</Link> : e.text}<time>{when(e.at)}</time></li>)}</ol>
            </div>
          ) : <p className="subtle">Nothing yet. Open a paper and it starts here.</p>}
          <details className="more" open={memory.length > 0}>
            <summary>Your own reminders{memory.length ? ` (${memory.length})` : ""}</summary>
            <Memory items={memory} matters={matters ?? []} />
          </details>
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

        <section id="reports" className="stack">
          <div>
            <h2>Problems</h2>
            <p className="muted" style={{ margin: 0 }}>Everything reported from a screen, with the picture and the brief that was emailed.</p>
          </div>
          <Reports items={reports.map((r) => {
            const u = parseUA(r.ctx.ua, r.ctx.touchPoints);
            return { id: r.id, at: r.at, by: r.by, kind: KINDS[r.kind], page: routeOf(r.ctx.url).name, note: r.note, device: `${u.device}, ${u.os}, ${u.browser}`, screen: `${r.ctx.viewport.w} x ${r.ctx.viewport.h}`,
              shotUrl: (shots as Record<string, string>)[r.id] ?? null, mail: r.mail, fixed: r.fixed, prompt: buildPrompt(r, origin) };
          })} />
        </section>
      </div>
    </main>
  );
}
