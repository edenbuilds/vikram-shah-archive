import { createHash, randomUUID } from "node:crypto";
import { readState, writeState } from "@/lib/access";

// Her memory: standing preferences and reminders that follow her across the app, Telegram and every
// connected AI app (Claude, ChatGPT, Cursor...) on any device. One JSON per person in the private
// bucket, so a change made anywhere is what every other surface reads next (two-way). It is her
// work product, never the record: the Ask agent sees it as how to work, and every fact it states
// must still be quoted from a page.

export type Memory = { id: string; text: string; matter: string | null; source: "web" | "telegram" | "ai"; at: string };
const path = (email: string) => `_system/memory/${createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 32)}.json`;
const MAX = 200, LEN = 500;

export async function getMemory(email: string): Promise<Memory[]> {
  return (await readState<{ items?: Memory[] }>(path(email), {})).items ?? [];
}

// ponytail: read-modify-write on one small file; two saves in the same second from two devices can
// drop one. A table with row-level writes if she ever saves that fast.
async function change(email: string, f: (items: Memory[]) => Memory[]) {
  const items = f(await getMemory(email)).slice(-MAX);
  await writeState(path(email), { items, updated: new Date().toISOString() });
  return items;
}

export const clean = (t: string) => t.replace(/\s+/g, " ").trim().slice(0, LEN);

export async function remember(email: string, text: string, matter: string | null, source: Memory["source"]): Promise<Memory> {
  const m: Memory = { id: randomUUID().slice(0, 8), text: clean(text), matter, source, at: new Date().toISOString() };
  if (m.text.length < 2) throw new Error("Nothing to remember");
  await change(email, (xs) => [...xs, m]);
  return m;
}

export const editMemory = (email: string, id: string, text: string) =>
  change(email, (xs) => xs.map((x) => (x.id === id ? { ...x, text: clean(text) || x.text, at: new Date().toISOString() } : x)));

export const forget = (email: string, id: string) => change(email, (xs) => xs.filter((x) => x.id !== id));

// Only items for all matters or for the matters in scope (a matter she can no longer see drops out).
export function forScope(items: Memory[], matterIds: string[]): Memory[] {
  return items.filter((x) => !x.matter || matterIds.includes(x.matter));
}

export function memoryNote(items: Memory[]): string {
  if (!items.length) return "";
  return "Her standing preferences and reminders (her own notes on how to work; NOT facts from the papers, never cite them):\n" +
    items.map((x) => `- ${x.text}`).join("\n");
}
