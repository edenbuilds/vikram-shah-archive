import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { admin, memberMatters, readState, writeState } from "./access.ts";

// 25-10-2026: Arya Files -> Case Companion. Omkar: open any Arya Files folder as a matter here, but no automatic
// OCR "until and unless she specifically asks". So files sent over are held in the bucket and listed in a small
// state file, not put in ingest_jobs (the worker claims every queued job on sight). Read moves them into the queue.
// A folder is tied to a matter by its Arya Files folder id, never by its name.

// ocr_url (25-10-2026): her OCR text from Arya Files, form-feed separated, saved beside the upload as <path>.ocr.txt
// so worker.py given_ocr() uses it and Read spends no OCR credits on pages it covers.
export type BridgeFile = { id: string; name: string; size: number; sha256: string; mime: string; url: string; ocr_url?: string; ocr_source?: string };
export type Ticket = { id: string; folder_id: string | null; folder: string; by: string; at: string; files: BridgeFile[] };
export type Held = { arya_id: string; name: string; size: number; sha256: string; path: string; at: string; by: string; ocr?: string };

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
        if (f.ocr_url) {
          // Without its text the file would be OCR'd again on Read, which is exactly what this is for avoiding.
          const o = await fetch(f.ocr_url, { cache: "no-store" });
          if (!o.ok) throw new Error(`Could not fetch the OCR text of "${f.name}" from Arya Files (${o.status}). Open it there again.`);
          const { error: e2 } = await admin().storage.from("companion").upload(`${path}.ocr.txt`, Buffer.from(await o.arrayBuffer()), { upsert: true, contentType: "text/plain; charset=utf-8" });
          if (e2) throw new Error(`Could not save the OCR text of "${f.name}": ${e2.message}`);
        }
        added.push({ arya_id: f.id, name: f.name, size: f.size, sha256: f.sha256, path, at: new Date().toISOString(), by, ...(f.ocr_url ? { ocr: f.ocr_source ?? "arya-files" } : {}) });
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

// ── Arya Files sync (25-10-2026): text back by checksum, and OCR on her request ─────────────────────────────

/** "Order.pdf, pp. 3-9, p. 12" -> [3..9, 12]: where a split paper's pages sit in the volume it came from. */
export function spans(sourcePath: string, filename: string): number[] | null {
  if (!sourcePath.startsWith(`${filename}, `)) return null;
  const out: number[] = [];
  for (const m of sourcePath.slice(filename.length + 2).matchAll(/pp?\. (\d+)(?:-(\d+))?/g)) {
    const a = Number(m[1]), b = Number(m[2] ?? m[1]);
    for (let i = a; i <= b; i++) out.push(i);
  }
  return out.length ? out : null;
}

async function pageTexts(doc: string): Promise<(string | null)[]> {
  const { data } = await admin().from("document_pages").select("page_no, text").eq("doc_id", doc).order("page_no").range(0, 9999);
  const out: (string | null)[] = [];
  for (const p of data ?? []) out[p.page_no - 1] = p.text; // a missing page stays a gap, never shifts the rest
  return Array.from(out, (t) => t ?? null);
}

export type CcText = { sha256: string; matter: string | null; doc_ids: string[]; state: string; ocr_source?: string; pages?: (string | null)[] };

/** What Case Companion has read for these bytes. Whole papers match by SHA-256; a volume split into papers is put
 *  back together in page order from its parts (only for files that came from Arya Files, found by their path). */
export async function textFor(sha256s: string[]): Promise<CcText[]> {
  const db = admin(), out: CcText[] = [];
  for (const sha of sha256s.filter((x) => /^[0-9a-f]{64}$/.test(x)).slice(0, 10)) {
    const { data: docs } = await db.from("documents").select("id, matter_id, ocr_source").eq("sha256", sha).limit(1);
    if (docs?.length) {
      out.push({ sha256: sha, matter: docs[0].matter_id, doc_ids: [docs[0].id], state: "filed", ocr_source: docs[0].ocr_source ?? undefined, pages: await pageTexts(docs[0].id) });
      continue;
    }
    const { data: jobs } = await db.from("ingest_jobs").select("matter_id, status, filename, page_count").like("storage_path", `%/uploads/arya-${sha.slice(0, 12)}-%`).order("created_at", { ascending: false }).limit(1);
    const j = jobs?.[0];
    if (!j) { out.push({ sha256: sha, matter: null, doc_ids: [], state: "none" }); continue; }
    if (j.status !== "done") { out.push({ sha256: sha, matter: j.matter_id, doc_ids: [], state: j.status }); continue; }
    const { data: parts } = await db.from("documents").select("id, source_path, ocr_source").eq("matter_id", j.matter_id).eq("filename", j.filename).like("source_path", `${j.filename}, p%`);
    const pages: (string | null)[] = Array(j.page_count ?? 0).fill(null);
    const ids: string[] = [];
    for (const d of parts ?? []) {
      const at = spans(d.source_path, j.filename);
      if (!at) continue;
      ids.push(d.id);
      (await pageTexts(d.id)).forEach((t, k) => { if (at[k]) pages[at[k] - 1] = t; });
    }
    out.push({ sha256: sha, matter: j.matter_id, doc_ids: ids, state: ids.length ? "filed" : "none", pages: ids.length ? pages : undefined });
  }
  return out;
}

/** Her matters, for the picker in Arya Files. */
export async function mattersFor(email: string) {
  const ids = await memberMatters(email);
  if (!ids.length) return [];
  const { data } = await admin().from("matters").select("id, title").in("id", ids).order("title");
  return data ?? [];
}

/** "Read with OCR" pressed in Arya Files: copy the file into the matter and queue it like her Read button would.
 *  Pages that already have text (her OCR, or the PDF's own layer) are not sent to OCR by the worker. */
export async function queueOcr(input: { file: BridgeFile; matter: string | null; folder_id: string | null; by: string }) {
  const db = admin(), mine = await memberMatters(input.by);
  let matter = input.matter ?? (input.folder_id ? (await readState<Record<string, string>>(LINKS, {}))[input.folder_id] : undefined);
  if (!matter || !mine.includes(matter)) return { matters: await mattersFor(input.by) };
  const { data: filed } = await db.from("documents").select("id").eq("matter_id", matter).eq("sha256", input.file.sha256).limit(1);
  if (filed?.length) return { state: "filed", matter };
  const path = pathFor(matter, input.file);
  const { data: jobs } = await db.from("ingest_jobs").select("status").eq("storage_path", path).order("created_at", { ascending: false }).limit(1);
  if (jobs?.length && jobs[0].status !== "failed") return { state: jobs[0].status as string, matter };
  await holdFiles(matter, { id: "ocr", folder_id: input.folder_id, folder: "", by: input.by, at: new Date().toISOString(), files: [input.file] }, input.by);
  const { data: m } = await db.from("matters").select("stages").eq("id", matter).single();
  const { data: users } = await db.auth.admin.listUsers({ perPage: 1000 });
  const uid = users?.users.find((u) => u.email?.toLowerCase() === input.by.toLowerCase())?.id;
  if (!uid) throw new Error("No Case Companion account for that email");
  const { error } = await db.from("ingest_jobs").insert({
    matter_id: matter, stage: (m?.stages as { id: string }[] | null)?.[0]?.id ?? "other", title: input.file.name.replace(/\.[^.]+$/, ""),
    filename: input.file.name, storage_path: path, created_by: uid,
  });
  if (error) throw new Error(error.message);
  // ponytail: read-then-write on one small JSON file, as readHeld does.
  await writeState(heldAt(matter), (await readState<Held[]>(heldAt(matter), [])).filter((h) => h.path !== path));
  return { queued: true, matter };
}
