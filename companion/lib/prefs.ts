import { createHash } from "node:crypto";
import { readState, writeState } from "@/lib/access";

// Per-person workspace arrangement: which folder each matter sits in, and which are archived.
// Kept as a small JSON file per user in the private bucket (no schema change); it only
// arranges matters, it never changes them.
export type Prefs = { folders: Record<string, string>; archived: string[] };
const path = (email: string) => `_system/prefs/${createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 32)}.json`;

export async function getPrefs(email: string): Promise<Prefs> {
  const p = await readState<Partial<Prefs>>(path(email), {});
  return { folders: p.folders ?? {}, archived: p.archived ?? [] };
}

export const setPrefs = (email: string, p: Prefs) => writeState(path(email), p);
