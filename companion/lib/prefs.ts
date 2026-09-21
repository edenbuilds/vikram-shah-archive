import { createHash } from "node:crypto";
import { admin } from "@/lib/access";

// Per-person workspace arrangement: which folder each matter sits in, and which are archived.
// Kept as a small JSON file per user in the private bucket (no schema change); it only
// arranges matters, it never changes them.
export type Prefs = { folders: Record<string, string>; archived: string[] };
const path = (email: string) => `_system/prefs/${createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 32)}.json`;

export async function getPrefs(email: string): Promise<Prefs> {
  const { data } = await admin().storage.from("companion").download(path(email));
  if (!data) return { folders: {}, archived: [] };
  const p = JSON.parse(await data.text());
  return { folders: p.folders ?? {}, archived: p.archived ?? [] };
}

export async function setPrefs(email: string, p: Prefs) {
  await admin().storage.from("companion").upload(path(email), new Blob([JSON.stringify(p)], { type: "application/json" }), { upsert: true });
}
