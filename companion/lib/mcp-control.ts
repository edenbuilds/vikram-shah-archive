import { createHash, randomUUID } from "node:crypto";
import { readState, writeState } from "./access.ts";

// 06-10-2026: Omkar: "the mcp goes ahead and causes irreversible changes ... i want the users to have more control on the mcp".
// Until now a write tool was only advisory: the AI app asked "confirm?" and could answer itself with confirm: true, and `forget`
// was a hard delete. Now the SERVER decides, per person, in Settings, AI apps:
//   review (default): a confirmed call is only queued; nothing changes until she approves it there, and she can edit it first
//   allow: it is applied, written to a log, and every entry has an Undo
//   off: connected apps are read-only; every write tool is refused
// "Automation that touches records stays review-only unless you say otherwise" is why review is the default.

export type Mode = "review" | "allow" | "off";
export type Write =
  | { tool: "add_note"; matter: string; doc: string; title: string; page: number; note: string; quote: string | null; start: number | null; end: number | null; kind: "note" | "bookmark" | "highlight"; colour: string }
  | { tool: "remember"; text: string; matter: string | null }
  | { tool: "forget"; id: string; text: string }
  | { tool: "correct_page"; matter: string; doc: string; title: string; page: number; text: string; reason: string | null; revert: boolean };
export type Undo = { do: "delete_annotation"; id: string } | { do: "forget"; id: string } | { do: "restore"; id: string } | { do: "revert_page"; doc: string; page: number; matter: string } | null;
export type Proposal = { id: string; at: string; w: Write; summary: string; status: "waiting" | "approved" | "declined" | "failed"; settled?: string; error?: string };
export type Entry = { id: string; at: string; via: "ai" | "approved"; summary: string; undo: Undo; undone: string | null };
export type Control = { mode: Mode; proposals: Proposal[]; log: Entry[] };

const path = (email: string) => `_system/mcp/${createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 32)}.json`;
const KEEP_PROPOSALS = 60, KEEP_LOG = 100;
export const MODES: Record<Mode, { label: string; line: string }> = {
  review: { label: "Ask me first", line: "A connected app can suggest a change. Nothing is saved until you approve it here, and you can edit it first." },
  allow: { label: "Allow, with undo", line: "Connected apps save changes straight away. Each one is listed below with an Undo." },
  off: { label: "Read only", line: "Connected apps can read and search your papers but cannot change anything." },
};

export function summarise(w: Write): string {
  const q = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n)}…` : s);
  switch (w.tool) {
    case "add_note": return `${w.kind === "highlight" ? `Highlight (${w.colour})` : w.kind === "bookmark" ? "Bookmark" : "Note"} on ${w.title}, p. ${w.page}${w.note ? `: "${q(w.note)}"` : ""}${w.quote ? ` on "${q(w.quote, 80)}"` : ""}`;
    case "remember": return `Remember${w.matter ? " (one matter)" : ""}: "${q(w.text)}"`;
    case "forget": return `Forget a memory: "${q(w.text)}"`;
    case "correct_page": return `${w.revert ? "Put back the first reading of" : "Correct the text of"} ${w.title}, p. ${w.page}`;
  }
}

// What she may edit before approving: the words of a note, a memory or a corrected page. A forget has nothing to edit.
export const editable = (w: Write): string | null => (w.tool === "add_note" ? (w.kind === "highlight" ? null : w.note) : w.tool === "remember" ? w.text : w.tool === "correct_page" && !w.revert ? w.text : null);
export function withText(w: Write, text: string): Write {
  const t = text.replace(/\r/g, "").trim();
  if (w.tool === "add_note" && w.kind !== "highlight") return { ...w, note: t.slice(0, 2000) };
  if (w.tool === "remember") return { ...w, text: t.replace(/\s+/g, " ").slice(0, 500) };
  if (w.tool === "correct_page" && !w.revert) return { ...w, text: t.slice(0, 60000) };
  return w;
}

export const getControl = async (email: string): Promise<Control> => {
  const c = await readState<Partial<Control>>(path(email), {});
  return { mode: c.mode ?? "review", proposals: c.proposals ?? [], log: c.log ?? [] };
};
// ponytail: read-modify-write on one small file per person; her own two devices saving in the same second can drop one. A table if it matters.
async function change(email: string, f: (c: Control) => Control) {
  const c = f(await getControl(email));
  const next = { ...c, proposals: c.proposals.slice(0, KEEP_PROPOSALS), log: c.log.slice(0, KEEP_LOG) };
  await writeState(path(email), next);
  return next;
}

export const setMode = (email: string, mode: Mode) => change(email, (c) => ({ ...c, mode }));
export async function enqueue(email: string, w: Write): Promise<Proposal> {
  const p: Proposal = { id: randomUUID().slice(0, 8), at: new Date().toISOString(), w, summary: summarise(w), status: "waiting" };
  await change(email, (c) => ({ ...c, proposals: [p, ...c.proposals] }));
  return p;
}
export const settle = (email: string, id: string, patch: Partial<Proposal>) => change(email, (c) => ({ ...c, proposals: c.proposals.map((p) => (p.id === id ? { ...p, ...patch, settled: new Date().toISOString() } : p)) }));
export const record = (email: string, w: Write, undo: Undo, via: Entry["via"]) =>
  change(email, (c) => ({ ...c, log: [{ id: randomUUID().slice(0, 8), at: new Date().toISOString(), via, summary: summarise(w), undo, undone: null }, ...c.log] }));
export const markUndone = (email: string, id: string) => change(email, (c) => ({ ...c, log: c.log.map((e) => (e.id === id ? { ...e, undone: new Date().toISOString() } : e)) }));
export const waiting = (c: Control) => c.proposals.filter((p) => p.status === "waiting");
