import { readState, writeState } from "@/lib/access";
import type { Ink } from "@/lib/pdf-comments";

// Her highlights' shapes, written by the worker beside the page scans (worker.file_notes) and, for ones she draws
// in the app, by addInk. Empty when none.
const path = (matter: string, doc: string) => `${matter}/pages/${doc}/ink.json`;
// readState goes round the storage CDN (a plain download can serve the file as it was a minute ago, which hid a
// highlight she had just drawn).
export const readInk = (matter: string, doc: string) => readState<Ink[]>(path(matter, doc), []);
export async function addInk(matter: string, doc: string, h: Ink) {
  await writeState(path(matter, doc), [...(await readInk(matter, doc)), h]);
}
export async function removeInk(matter: string, doc: string, id: string) {
  const all = await readInk(matter, doc), kept = all.filter((h) => h.id !== id);
  if (kept.length !== all.length) await writeState(path(matter, doc), kept);
}
