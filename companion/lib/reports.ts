import { randomBytes } from "node:crypto";
import { admin, readState, writeState } from "./access.ts";
import { REPORT_TO, sendMail } from "./agentmail.ts";

// Problem reports (06-10-2026: Omkar: "the user can report a bug, it takes the context and sends an email ... drafted so it
// perfectly maps out the problem and creates the ideal instruction prompt for my claude agent ... every flag/bug remains
// accessible, recorded and noted under settings ... take the relevant screenshot"). The page sends what it can see (where the
// finger or pointer was, what was under it, the viewport, recent console errors) and her words; this file cleans it, turns it
// into one mail whose body is a paste-ready brief for a coding agent, and keeps the record and the screenshot in the private
// bucket. Nothing here touches a paper or a note.

export type Kind = "visual" | "function" | "feature" | "other";
export type Target = { tag: string; role: string; label: string; text: string; selector: string; rect: number[]; crumbs: string[] };
export type Ctx = {
  url: string; title: string; how: string; viewport: { w: number; h: number; dpr: number }; scroll: number[]; touch: boolean; touchPoints: number;
  lang: string; tz: string; online: boolean; ua: string; target: Target | null; around: string; errors: string[]; failed: string[]; prefs: string;
};
export type Report = {
  id: string; at: string; by: string; kind: Kind; note: string; ctx: Ctx; shot: string | null;
  mail: "sent" | "failed" | "queued"; mailError?: string; fixed: string | null;
};

export const KINDS: Record<Kind, string> = { visual: "Looks wrong", function: "Does not work", feature: "Feature missing or wrong", other: "Something else" };
const INDEX = "_system/reports/index.json";
const MAX = 300;

// ── cleaning ─────────────────────────────────────────────────────────────
// A sign-in link, an MCP link, a bearer token or a JWT can sit in a URL or in text near the target. None may reach a mail or a log.
export function redact(s: string): string {
  return s
    .replace(/\/(k|api\/mcp|api\/telegram|skill)\/[^\s/?#"')]+/g, "/$1/[redacted]")
    .replace(/eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/g, "[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{30,}/g, "[redacted]")
    .replace(/\b(sk|am|key|api)[-_][A-Za-z0-9_-]{16,}/gi, "[redacted]")
    .replace(/([?&](?:token|key|code|secret|access_token)=)[^&\s]+/gi, "$1[redacted]");
}
const s = (v: unknown, n: number) => redact(String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n));
const list = (v: unknown, n: number, len: number) => (Array.isArray(v) ? v.slice(0, n).map((x) => s(x, len)).filter(Boolean) : []);
const num = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : d);

export function clean(p: { kind?: unknown; note?: unknown; ctx?: Record<string, any> }): { kind: Kind; note: string; ctx: Ctx } {
  const c = p.ctx ?? {}, t = c.target;
  return {
    kind: p.kind === "visual" || p.kind === "function" || p.kind === "feature" ? p.kind : "other",
    note: String(p.note ?? "").replace(/\r/g, "").trim().slice(0, 2000),
    ctx: {
      url: s(c.url, 400), title: s(c.title, 160), how: s(c.how, 20),
      viewport: { w: num(c.viewport?.w), h: num(c.viewport?.h), dpr: Math.round(Number(c.viewport?.dpr || 1) * 100) / 100 },
      scroll: [num(c.scroll?.[0]), num(c.scroll?.[1])], touch: !!c.touch, touchPoints: num(c.touchPoints),
      lang: s(c.lang, 20), tz: s(c.tz, 40), online: c.online !== false, ua: s(c.ua, 300),
      target: t ? { tag: s(t.tag, 20), role: s(t.role, 40), label: s(t.label, 120), text: s(t.text, 200), selector: s(t.selector, 300),
        rect: Array.isArray(t.rect) ? t.rect.slice(0, 4).map((x: unknown) => num(x)) : [], crumbs: list(t.crumbs, 6, 80) } : null,
      around: s(c.around, 700), errors: list(c.errors, 8, 240), failed: list(c.failed, 8, 200), prefs: s(c.prefs, 120),
    },
  };
}

// ── where, and on what ──────────────────────────────────────────────────
const ROUTES: [RegExp, string, string[]][] = [
  [/^\/$/, "Home", ["app/page.tsx", "components/Claims.tsx"]],
  [/^\/ask$/, "Ask, all matters", ["app/ask/page.tsx", "app/api/ask/route.ts", "lib/agent.ts"]],
  [/^\/board$/, "Board", ["app/board/page.tsx", "components/ui/kanban-board.tsx", "lib/board.ts", "lib/board-store.ts"]],
  [/^\/pins$/, "Pins", ["app/pins/page.tsx", "lib/study.ts"]],
  [/^\/search$/, "Search", ["app/search/page.tsx"]],
  [/^\/settings/, "Settings", ["app/settings/page.tsx", "app/settings/*.tsx"]],
  [/^\/connect$/, "Connect an app", ["app/connect/page.tsx"]],
  [/^\/login$/, "Sign in", ["app/login/page.tsx", "components/ui/sign-in.tsx"]],
  [/^\/m\/[^/]+$/, "Matter, Papers", ["app/m/[matter]/page.tsx", "app/m/[matter]/layout.tsx"]],
  [/^\/m\/[^/]+\/d\/[^/]+/, "Paper reader", ["app/m/[matter]/d/[doc]/page.tsx", "lib/corrections.ts", "lib/highlight.ts", "lib/citations.ts"]],
  [/^\/m\/[^/]+\/ask/, "Matter, Ask", ["app/m/[matter]/ask/page.tsx", "lib/agent.ts"]],
  [/^\/m\/[^/]+\/brief/, "Matter, Brief", ["app/m/[matter]/brief/page.tsx", "lib/study.ts"]],
  [/^\/m\/[^/]+\/chronology/, "Matter, Chronology", ["app/m/[matter]/chronology/page.tsx", "lib/study.ts"]],
  [/^\/m\/[^/]+\/collections/, "Matter, Collections", ["app/m/[matter]/collections/page.tsx"]],
  [/^\/m\/[^/]+\/compare/, "Matter, Compare", ["app/m/[matter]/compare/page.tsx"]],
  [/^\/m\/[^/]+\/explainer/, "Matter, Explainer", ["app/m/[matter]/explainer/page.tsx", "app/api/study/route.ts"]],
  [/^\/m\/[^/]+\/hearings/, "Matter, Hearings", ["app/m/[matter]/hearings/page.tsx", "app/m/[matter]/hearings/[id]/page.tsx", "lib/minutes.ts"]],
  [/^\/m\/[^/]+\/map/, "Matter, Map", ["app/m/[matter]/map/page.tsx"]],
  [/^\/m\/[^/]+\/reading/, "Matter, Reading order", ["app/m/[matter]/reading/page.tsx", "lib/reading.ts"]],
  [/^\/m\/[^/]+\/upload/, "Matter, Upload", ["app/m/[matter]/upload/page.tsx", "worker/worker.py"]],
];
export function routeOf(url: string): { name: string; files: string[]; path: string } {
  let path = "/";
  try { path = new URL(url, "https://x").pathname; } catch { /* keep "/" */ }
  const hit = ROUTES.find(([re]) => re.test(path));
  return { name: hit?.[1] ?? "Unknown page", files: hit?.[2] ?? [], path };
}

export function parseUA(ua: string, touchPoints = 0): { browser: string; os: string; device: string } {
  const v = (re: RegExp) => ua.match(re)?.[1]?.replace(/_/g, ".") ?? "";
  const browser = /Edg\//.test(ua) ? `Edge ${v(/Edg\/([\d.]+)/)}` : /OPR\//.test(ua) ? `Opera ${v(/OPR\/([\d.]+)/)}` : /SamsungBrowser/.test(ua) ? `Samsung Internet ${v(/SamsungBrowser\/([\d.]+)/)}`
    : /FxiOS|Firefox/.test(ua) ? `Firefox ${v(/(?:FxiOS|Firefox)\/([\d.]+)/)}` : /CriOS/.test(ua) ? `Chrome on iOS ${v(/CriOS\/([\d.]+)/)}` : /Chrome\//.test(ua) ? `Chrome ${v(/Chrome\/([\d.]+)/)}`
    : /Safari\//.test(ua) ? `Safari ${v(/Version\/([\d.]+)/)}` : "an unknown browser";
  const ipadDesktop = /Macintosh/.test(ua) && touchPoints > 1;  // iPadOS Safari asks for the desktop site and says it is a Mac
  const os = /iPhone OS|CPU OS/.test(ua) ? `iOS ${v(/OS ([\d_]+)/)}` : ipadDesktop ? "iPadOS" : /Android/.test(ua) ? `Android ${v(/Android ([\d.]+)/)}`
    : /Windows NT/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /CrOS/.test(ua) ? "ChromeOS" : /Linux/.test(ua) ? "Linux" : "an unknown system";
  const device = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) || ipadDesktop ? "iPad" : /Android/.test(ua) ? (/Mobile/.test(ua) ? "Android phone" : "Android tablet") : "computer";
  return { browser: browser.trim(), os: os.trim(), device };
}

// DD-MM-YYYY, Asia/Kolkata (the app's rule for every date on screen and in mail)
export const ist = (iso: string) => {
  const d = new Date(iso);
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day}-${p.month}-${p.year} ${p.hour}:${p.minute} IST`;
};

// ── the brief for the agent ──────────────────────────────────────────────
const HOW: Record<string, string> = { hold: "press and hold", double: "double tap or double click", force: "a firm press", menu: "the Report a problem menu entry", picked: "the Report a problem menu entry, then choosing the element", button: "the Report a problem button" };
const AREA: Record<Kind, string> = {
  visual: "A layout, spacing, overflow, colour, type or touch-target fault. Check the screenshot first: the red outline marks the element she pointed at.",
  function: "Something does not do what it should (a button, a save, a search, a page that fails to load). Find the server action or route behind it before touching the interface.",
  feature: "A feature is missing, half done, or behaves differently from what she expects. Do not invent behaviour: say in your first line what she expects and what happens now, check DESIGN.md and HANDOFF.md for whether it was meant, and propose the smallest change before building anything large.",
  other: "Not classified by the reporter. Work out from her words and the screenshot whether this is visual or functional, and say which in your first line.",
};

export function buildPrompt(r: Report, origin: string): string {
  const c = r.ctx, route = routeOf(c.url), ua = parseUA(c.ua, c.touchPoints), t = c.target;
  const device = `${ua.device}, ${ua.os}, ${ua.browser}, ${c.viewport.w} x ${c.viewport.h} at ${c.viewport.dpr}x, ${c.touch ? "touch" : "mouse and keyboard"}`;
  const L: string[] = [];
  L.push(`# Fix a problem reported in Case Companion (${r.id})`, "");
  L.push("You are working in the repo edenbuilds/vikram-shah-archive, folder companion/ (Next.js 15, React 19, Supabase storage and Postgres, Vercel, a Python worker). Read companion/HANDOFF.md and companion/DESIGN.md before you change anything.", "");
  L.push("## What was reported", `Kind: ${KINDS[r.kind]}. ${AREA[r.kind]}`, `Reported by ${r.by} on ${ist(r.at)}, using ${HOW[c.how] ?? "the report gesture"}.`, "Her words, unedited:", `> ${r.note ? r.note.replace(/\n/g, "\n> ") : "(nothing typed; work from the screenshot and the context)"}`, "");
  L.push("## Where", `Page: ${route.name} (${route.path})`, `Live URL: ${c.url.startsWith("http") ? c.url : origin + c.url}`, `Tab title: ${c.title || "(none)"}`);
  if (route.files.length) L.push(`Start in: ${route.files.join(", ")}`);
  if (t) {
    L.push("", "## What she pointed at", `Element: <${t.tag}>${t.role ? ` role=${t.role}` : ""}${t.label ? `, label "${t.label}"` : ""}${t.text ? `, text "${t.text}"` : ""}`, `Selector: ${t.selector}`);
    if (t.rect.length === 4) L.push(`Box on screen: x ${t.rect[0]}, y ${t.rect[1]}, ${t.rect[2]} wide, ${t.rect[3]} tall (viewport ${c.viewport.w} x ${c.viewport.h}, scrolled ${c.scroll[1]}px down)`);
    if (t.crumbs.length) L.push(`Inside: ${t.crumbs.join(" > ")}`);
  } else L.push("", "She did not point at a specific element: the whole screen is the subject.");
  if (c.around) L.push("", "Text around it (so you can find it in the source):", `> ${c.around}`);
  L.push("", "## Her device", device, `Language ${c.lang || "unknown"}, time zone ${c.tz || "unknown"}, ${c.online ? "online" : "offline"}.${c.prefs ? ` Display settings: ${c.prefs}.` : ""}`);
  if (c.errors.length || c.failed.length) {
    L.push("", "## What the browser logged just before");
    c.errors.forEach((e) => L.push(`- console error: ${e}`));
    c.failed.forEach((e) => L.push(`- failed request: ${e}`));
  }
  L.push("", "## What to do",
    "1. Reproduce it first, at her viewport, on the live URL. If you cannot, say exactly what you tried and stop; do not guess a fix.",
    "2. Find the root cause. Grep every caller of whatever you are about to change and fix it once, where all callers route through. Smallest diff that holds.",
    "3. Do not change anything else: no redesign, no new feature, no new dependency unless the fix needs one.",
    `4. Keep the rules in DESIGN.md: radius 4px or less, no shadows, gradients, status pills, em dashes or emojis; dates DD-MM-YYYY in Asia/Kolkata; in-app dialogs only; one animation library per element; reduced motion respected. ${r.kind === "visual" ? "Check 390 px (iPhone), 820 px (iPad), 1024 px (iPad Pro) and 1440 px (laptop): no sideways scroll, targets at least 44 px." : "Keep papers and her notes separate and never invent legal data."}`,
    "5. Verify on the live site at desktop and 390 px after you deploy (HTTP 200 or a green build is not proof), run npm test and npx tsc --noEmit, and add one test that fails without the fix.",
    "6. Commit to main as a plain sentence naming the fix and this id, with git author omkar1sonawane@gmail.com, then deploy from companion/ only. Send me the live link and a line on what you verified and what you could not.", "",
    `Screenshot: ${r.shot ? "attached to the mail, and kept in Settings, Problems" : "none could be taken on that device; rely on the context above"}.`,
    `Record: ${origin}/settings#reports (press Mark fixed on ${r.id} when it is deployed).`);
  return L.join("\n");
}

// ── the mail ─────────────────────────────────────────────────────────────
const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function subjectOf(r: Report): string {
  const route = routeOf(r.ctx.url).name, what = (r.note || "No description").replace(/\s+/g, " ").slice(0, 70);
  return `Case Companion ${r.id}: ${KINDS[r.kind].toLowerCase()} on ${route}, ${what}`.slice(0, 160);
}

export function buildMail(r: Report, origin: string, hasShot: boolean): { subject: string; text: string; html: string } {
  const prompt = buildPrompt(r, origin), c = r.ctx, route = routeOf(c.url), ua = parseUA(c.ua, c.touchPoints);
  const rows: [string, string][] = [["Page", `${route.name} (${route.path})`], ["Kind", KINDS[r.kind]], ["From", `${r.by}, ${ist(r.at)}`],
    ["Device", `${ua.device}, ${ua.os}, ${ua.browser}`], ["Screen", `${c.viewport.w} x ${c.viewport.h} at ${c.viewport.dpr}x, ${c.touch ? "touch" : "mouse"}`]];
  if (c.target) rows.push(["Pointed at", `<${c.target.tag}> ${c.target.label || c.target.text || c.target.selector}`.slice(0, 140)]);
  const font = "font-family:Helvetica,Arial,sans-serif";
  const html = `<!doctype html><html><body style="margin:0;background:#faf9f6;padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#ffffff;border:1px solid #dedbd6;border-radius:4px;border-top:3px solid #0007cb">
<tr><td style="padding:24px 28px 0;font-family:Georgia,serif;font-size:13px;color:#585858">Case Companion · ${esc(r.id)}</td></tr>
<tr><td style="padding:8px 28px 0"><h1 style="margin:0;font-family:Georgia,serif;font-weight:400;letter-spacing:-.02em;font-size:24px;color:#111111">${esc(KINDS[r.kind])} on ${esc(route.name)}</h1>
<p style="margin:12px 0 0;${font};font-size:16px;line-height:1.55;color:#111111;white-space:pre-wrap">${esc(r.note || "(nothing typed)")}</p></td></tr>
<tr><td style="padding:16px 28px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="${font};font-size:13px;line-height:1.5">${rows.map(([k, v]) => `<tr><td style="padding:3px 12px 3px 0;color:#888888;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:3px 0;color:#111111">${esc(v)}</td></tr>`).join("")}</table></td></tr>
${hasShot ? `<tr><td style="padding:18px 28px 0"><img src="cid:shot" alt="Screenshot of the page, the element she pointed at outlined in red" width="584" style="display:block;max-width:100%;height:auto;border:1px solid #dedbd6;border-radius:4px"></td></tr>` : ""}
<tr><td style="padding:22px 28px 6px;${font};font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#888888">Paste this into Claude Code</td></tr>
<tr><td style="padding:0 28px 8px"><pre style="margin:0;padding:14px;background:#faf9f6;border:1px solid #dedbd6;border-radius:4px;font-family:Menlo,Consolas,monospace;font-size:12px;line-height:1.55;color:#111111;white-space:pre-wrap;word-break:break-word">${esc(prompt)}</pre></td></tr>
<tr><td style="padding:12px 28px 24px"><a href="${esc(origin)}/settings#reports" style="display:inline-block;background:#0007cb;color:#ffffff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:4px;${font};font-size:14px">Open in Settings, Problems</a></td></tr>
</table></td></tr></table></body></html>`;
  return { subject: subjectOf(r), text: `${prompt}\n`, html };
}

// ── storage ──────────────────────────────────────────────────────────────
export const newId = () => `CC-${randomBytes(3).toString("hex").toUpperCase()}`;
export const shotPath = (id: string) => `_system/reports/${id}.jpg`;

// ponytail: one index file, read-modify-write; two reports in the same second can drop one. A table if the volume ever matters.
export const getReports = async (): Promise<Report[]> => (await readState<{ items?: Report[] }>(INDEX, {})).items ?? [];
async function change(f: (xs: Report[]) => Report[]) {
  const items = f(await getReports()).slice(0, MAX);
  await writeState(INDEX, { items, updated: new Date().toISOString() });
  return items;
}
export const addReport = (r: Report) => change((xs) => [r, ...xs]);
export const patchReport = (id: string, p: Partial<Report>) => change((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));
export const dropReport = async (id: string) => {
  await change((xs) => xs.filter((x) => x.id !== id));
  await admin().storage.from("companion").remove([shotPath(id)]);
};

export async function saveShot(id: string, dataUrl: string): Promise<string | null> {
  const m = dataUrl.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/);
  if (!m || m[1].length > 3_300_000) return null;
  const { error } = await admin().storage.from("companion").upload(shotPath(id), Buffer.from(m[1], "base64"), { contentType: "image/jpeg", upsert: true, cacheControl: "0" });
  return error ? null : shotPath(id);
}

export async function shotUrls(rs: Report[]): Promise<Record<string, string>> {
  const paths = rs.filter((r) => r.shot).map((r) => r.shot!);
  if (!paths.length) return {};
  const { data } = await admin().storage.from("companion").createSignedUrls(paths, 3600);
  const out: Record<string, string> = {};
  for (const d of data ?? []) if (d.signedUrl && d.path) out[d.path.split("/").pop()!.replace(".jpg", "")] = d.signedUrl;
  return out;
}

export async function shotBase64(id: string): Promise<string | null> {
  const { data } = await admin().storage.from("companion").download(shotPath(id));
  return data ? Buffer.from(await data.arrayBuffer()).toString("base64") : null;
}

// Sends (or resends) the mail and records how it went, so the Problems list is honest about a mail that did not leave.
export async function deliver(r: Report, origin: string): Promise<Report["mail"]> {
  let mail: Report["mail"] = "sent", mailError: string | undefined;
  try {
    const b64 = r.shot ? await shotBase64(r.id) : null;
    const m = buildMail(r, origin, !!b64);
    await sendMail({
      to: REPORT_TO, subject: m.subject, text: m.text, html: m.html, labels: ["case-companion", "problem-report", r.kind], replyTo: REPORT_TO,
      attachments: b64 ? [{ filename: `${r.id}.jpg`, content_type: "image/jpeg", content: b64, content_disposition: "inline", content_id: "shot" }] : undefined,
    });
  } catch (e) { mail = "failed"; mailError = (e as Error).message.slice(0, 200); }
  await patchReport(r.id, { mail, mailError });
  return mail;
}
