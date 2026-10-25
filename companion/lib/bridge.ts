import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { admin, readState, writeState } from "./access.ts";

// 25-10-2026: Arya Files -> Case Companion. Omkar: open any Arya Files folder as a matter here, but no automatic
// OCR "until and unless she specifically asks". So files sent over are held in the bucket and listed in a small
// state file, not put in ingest_jobs (the worker claims every queued job on sight). Read moves them into the queue.
// A folder is tied to a matter by its Arya Files folder id, never by its name.

export type BridgeFile = { id: string; name: string; size: number; sha256: string; mime: string; url: string };
export type Ticket = { id: string; folder_id: string | null; folder: string; by: string; at: string; files: BridgeFile[] };
export type Held = { arya_id: string; name: string; size: number; sha256: string; path: string; at: string; by: string };

export const ticketAt = (id: string) => `_system/bridge/tickets/${id}.json`;
export const heldAt = (matter: string) => `_system/bridge/held/${matter}.json`;
export const LINKS = "_system/bridge/arya-folders.json"; // { [arya folder id]: matter id }

export const signBody = (body: string, secret = process.env.BRIDGE_SECRET ?? "") => createHmac("sha256", secret).update(body).digest("hex");
export function signedOk(body: string, sig: string | null, secret = process.env.BRIDGE_SECRET ?? ""): boolean {
  if (!secret || !sig) return false;
  const want = Buffer.from(signBody(body, secret)), got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** Same bytes, same path: sending a folder twice adds nothing; a changed file comes over as a new one. */
export const pathFor = (matter: string, f: { sha256: string; name: string }) =>
  `${matter}/uploads/arya-${f.sha256.slice(0, 12)}-${f.name.replace(/[^\w.\- ()]+/g, "_").slice(-120)}`;

/** Paths already in this matter: held, or uploaded through the queue. */
export async function known(matter: string): Promise<Set<string>> {
  const [held, { data: jobs }] = await Promise.all([
    readState<Held[]>(heldAt(matter), []),
    admin().from("ingest_jobs").select("storage_path").eq("matter_id", matter),
  ]);
  return new Set([...held.map((h) => h.path), ...(jobs ?? []).map((j) => j.storage_path)]);
}

/** Copy the ticket's files into the matter and hold them. Bytes are checked against Arya Files' size and SHA-256. */
export async function holdFiles(matter: string, t: Ticket, by: string): Promise<number> {
  const have = await known(matter);
  const todo = t.files.filter((f) => !have.has(pathFor(matter, f)));
  const added: Held[] = [];
  try {
    // ponytail: 4 at a time, each file buffered whole; a folder of 1 GB+ scans would want streaming uploads.
    for (let i = 0; i < todo.length; i += 4) {
      await Promise.all(todo.slice(i, i + 4).map(async (f) => {
        const r = await fetch(f.url, { cache: "no-store" });
        if (!r.ok) throw new Error(`Could not fetch "${f.name}" from Arya Files (${r.status}). Open the folder there again.`);
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length !== f.size || createHash("sha256").update(buf).digest("hex") !== f.sha256) throw new Error(`"${f.name}" did not arrive intact. Nothing was guessed; try again.`);
        const path = pathFor(matter, f);
        const { error } = await admin().storage.from("companion").upload(path, buf, { upsert: true, contentType: f.mime || "application/octet-stream" });
        if (error) throw new Error(`Could not save "${f.name}": ${error.message}`);
        added.push({ arya_id: f.id, name: f.name, size: f.size, sha256: f.sha256, path, at: new Date().toISOString(), by });
      }));
    }
  } finally {
    // Whatever arrived is kept even if a later file failed, so a retry only fetches the rest.
    if (added.length) await writeState(heldAt(matter), [...(await readState<Held[]>(heldAt(matter), [])), ...added]);
  }
  return added.length;
}

// Same list as the Uploader's OK (what worker.py as_pdf can turn into a PDF); anything else stays in Arya Files.
const OK = /\.(pdf|jpe?g|png|heic|heif|tiff?|gif|bmp|webp|docx?|rtf|odt|html?|md|markdown|txt|csv|pptx|xlsx?|epub|msg|ipynb|json|xml)$/i;
export const bridgeable = (f: { name: string }) => OK.test(f.name);
