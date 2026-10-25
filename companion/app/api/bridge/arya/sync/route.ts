import { mattersFor, queueOcr, signedOk, textFor } from "@/lib/bridge";

// Arya Files <-> Case Companion, server to server, signed like the folder bridge (HMAC of the body, 5-minute window).
//   matters  her matters, for the "Read with OCR" picker in Arya Files
//   text     what has been read for these SHA-256s (Arya Files copies it home; no OCR runs)
//   ocr      she pressed "Read with OCR" in Arya Files: copy the file into the matter and queue it
const ARYA = (process.env.ARYA_FILES_URL ?? "https://arya-files.tryklint.workers.dev").replace(/\/$/, "");
export const maxDuration = 300;

export async function POST(req: Request) {
  if (!process.env.BRIDGE_SECRET) return Response.json({ error: "Bridge not configured" }, { status: 503 });
  const raw = await req.text();
  if (!signedOk(raw, req.headers.get("x-bridge-signature"))) return Response.json({ error: "Bad signature" }, { status: 401 });
  let b: any;
  try { b = JSON.parse(raw); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!(Math.abs(Date.now() - Date.parse(b.at)) < 5 * 60_000)) return Response.json({ error: "Stale request" }, { status: 401 });
  try {
    if (b.action === "matters") return Response.json({ matters: await mattersFor(String(b.by ?? "")) });
    if (b.action === "text") return Response.json({ items: await textFor(Array.isArray(b.sha256s) ? b.sha256s : []) });
    if (b.action === "ocr") {
      const f = b.file;
      if (!(typeof f?.url === "string" && f.url.startsWith(`${ARYA}/dl/`) && /^[0-9a-f]{64}$/.test(f.sha256) && Number.isFinite(f.size) && typeof f.name === "string"))
        return Response.json({ error: "Bad file" }, { status: 400 });
      if (f.ocr_url && !String(f.ocr_url).startsWith(`${ARYA}/dl/`)) delete f.ocr_url;
      return Response.json(await queueOcr({ file: f, matter: b.matter ?? null, folder_id: b.folder_id ?? null, by: String(b.by ?? "") }));
    }
    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
