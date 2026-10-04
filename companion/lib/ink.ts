import { admin } from "@/lib/access";
import type { Ink } from "@/lib/pdf-comments";

// Her highlights' shapes, written by the worker beside the page scans (worker.file_notes). Empty when none.
export async function readInk(matter: string, doc: string): Promise<Ink[]> {
  const { data } = await admin().storage.from("companion").download(`${matter}/pages/${doc}/ink.json`);
  if (!data) return [];
  try { return JSON.parse(await data.text()) as Ink[]; } catch { return []; }
}
