import type { SupabaseClient } from "@supabase/supabase-js";

// 04-10-2026: Omkar asked for no 50 MB cap. This Supabase plan refuses any one object over 50 MB, so a
// bigger file is stored as <path>.part000, .part001... (worker/corpus.py storage_put, and the same layout
// the uploader sends) and joined again here or in the browser. Small files stay one object.
const PIECE = 40 * 1024 * 1024;
const bucket = (db: SupabaseClient) => db.storage.from("companion");

/** Signed URLs of a file's pieces, in order; [] when it is stored whole (or missing). */
export async function pieceUrls(db: SupabaseClient, path: string, seconds = 1800): Promise<string[]> {
  const dir = path.slice(0, path.lastIndexOf("/")), base = path.slice(path.lastIndexOf("/") + 1);
  const { data } = await bucket(db).list(dir, { search: `${base}.part`, limit: 1000 });
  const names = (data ?? []).map((o) => o.name).filter((n) => /^\.part\d{3}$/.test(n.slice(base.length)) && n.startsWith(base)).sort();
  if (!names.length) return [];
  const { data: signed } = await bucket(db).createSignedUrls(names.map((n) => `${dir}/${n}`), seconds);
  return (signed ?? []).map((s) => s.signedUrl ?? "");
}

export async function readFile(db: SupabaseClient, path: string): Promise<Uint8Array | null> {
  const whole = await bucket(db).download(path);
  if (whole.data) return new Uint8Array(await whole.data.arrayBuffer());
  const urls = await pieceUrls(db, path, 300);
  if (!urls.length) return null;
  const parts = await Promise.all(urls.map(async (u) => new Uint8Array(await (await fetch(u)).arrayBuffer())));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  parts.reduce((at, p) => (out.set(p, at), at + p.length), 0);
  return out;
}

export async function putFile(db: SupabaseClient, path: string, bytes: Uint8Array, contentType: string): Promise<string | null> {
  if (bytes.length <= PIECE) return (await bucket(db).upload(path, bytes, { contentType, upsert: true })).error?.message ?? null;
  for (let k = 0, at = 0; at < bytes.length; k++, at += PIECE) {
    const { error } = await bucket(db).upload(`${path}.part${String(k).padStart(3, "0")}`, bytes.subarray(at, at + PIECE), { contentType: "application/octet-stream", upsert: true });
    if (error) return error.message;
  }
  return null;
}

/** A small page that fetches the pieces, joins them and saves (or shows) the file; no big response
 *  ever passes through a serverless function. */
export function joinerPage(urls: string[], filename: string, view: boolean): string {
  const j = JSON.stringify;
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${filename.replace(/[<&]/g, "")}</title>
<body style="font:15px system-ui;margin:2rem;color:#222"><p id="s">Preparing ${filename.replace(/[<&]/g, "")}...</p><script>
(async () => { const s = document.getElementById("s"); try {
  const parts = []; for (const [i, u] of ${j(urls)}.entries()) { s.textContent = "Fetching part " + (i + 1) + " of ${urls.length}..."; const r = await fetch(u); if (!r.ok) throw new Error(r.status); parts.push(await r.blob()); }
  const url = URL.createObjectURL(new Blob(parts, { type: "application/pdf" }));
  if (${j(view)}) { location.replace(url); return; }
  const a = Object.assign(document.createElement("a"), { href: url, download: ${j(filename)} }); document.body.append(a); a.click();
  s.textContent = "Saved. You can close this tab.";
} catch (e) { s.textContent = "Could not fetch the file (" + e.message + "). Reload to try again."; } })();
</script>`;
}
