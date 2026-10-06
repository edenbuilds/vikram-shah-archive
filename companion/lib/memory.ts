import { createHash, randomUUID } from "node:crypto";
import { readState, writeState } from "./access.ts";

// Her memory: standing preferences and reminders that follow her across the app, Telegram and every
// connected AI app (Claude, ChatGPT, Cursor...) on any device. One JSON per person in the private
// bucket, so a change made anywhere is what every other surface reads next (two-way). It is her
// work product, never the record: the Ask agent sees it as how to work, and every fact it states
// must still be quoted from a page.

export type Memory = { id: string; text: string; matter: string | null; source: "web" | "telegram" | "ai"; at: string };
export type Gone = Memory & { gone: string };
type S = { items: Memory[]; trash: Gone[] };
const path = (email: string) => `_system/memory/${createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 32)}.json`;
const MAX = 200, LEN = 500, TRASH = 50, TRASH_DAYS = 30;

const read = (email: string) => readState<{ items?: Memory[]; trash?: Gone[] }>(path(email), {});
export async function getMemory(email: string): Promise<Memory[]> {
  return (await read(email)).items ?? [];
}
// 06-10-2026: forgetting was a hard delete, and an AI app could do it. It now moves the item here for 30 days, so it can be put back
// (Settings, Memory, "Recently forgotten"; Settings, AI apps, Undo).
export async function getTrash(email: string): Promise<Gone[]> {
  return ((await read(email)).trash ?? []).filter((g) => Date.now() - Date.parse(g.gone) < TRASH_DAYS * 864e5);
}

export const trashOne = (s: S, id: string, now = new Date()): S => {
  const x = s.items.find((m) => m.id === id);
  return x ? { items: s.items.filter((m) => m.id !== id), trash: [{ ...x, gone: now.toISOString() }, ...s.trash] } : s;
};
export const restoreOne = (s: S, id: string): S => {
  const g = s.trash.find((m) => m.id === id);
  if (!g) return s;
  const { gone: _gone, ...m } = g;
  return { items: [...s.items, m], trash: s.trash.filter((x) => x.id !== id) };
};

// ponytail: read-modify-write on one small file; two saves in the same second from two devices can
// drop one. A table with row-level writes if she ever saves that fast.
async function change(email: string, f: (s: S) => S) {
  const was = await read(email);
  const s = f({ items: was.items ?? [], trash: await getTrash(email) });
  const items = s.items.slice(-MAX);
  await writeState(path(email), { items, trash: s.trash.slice(0, TRASH), updated: new Date().toISOString() });
  return items;
}

export const clean = (t: string) => t.replace(/\s+/g, " ").trim().slice(0, LEN);

export async function remember(email: string, text: string, matter: string | null, source: Memory["source"]): Promise<Memory> {
  const m: Memory = { id: randomUUID().slice(0, 8), text: clean(text), matter, source, at: new Date().toISOString() };
  if (m.text.length < 2) throw new Error("Nothing to remember");
  await change(email, (s) => ({ ...s, items: [...s.items, m] }));
  return m;
}

export const editMemory = (email: string, id: string, text: string) =>
  change(email, (s) => ({ ...s, items: s.items.map((x) => (x.id === id ? { ...x, text: clean(text) || x.text, at: new Date().toISOString() } : x)) }));

export const forget = (email: string, id: string) => change(email, (s) => trashOne(s, id));
export const restore = (email: string, id: string) => change(email, (s) => restoreOne(s, id));

// Only items for all matters or for the matters in scope (a matter she can no longer see drops out).
export function forScope(items: Memory[], matterIds: string[]): Memory[] {
  return items.filter((x) => !x.matter || matterIds.includes(x.matter));
}

export function memoryNote(items: Memory[]): string {
  if (!items.length) return "";
  return "Her standing preferences and reminders (her own notes on how to work; NOT facts from the papers, never cite them):\n" +
    items.map((x) => `- ${x.text}`).join("\n");
}
