import { randomUUID } from "node:crypto";
import { writeState } from "@/lib/access";
import { type BridgeFile, signedOk, type Ticket, ticketAt } from "@/lib/bridge";

// Arya Files posts a folder (or a pick of files) here, signed with BRIDGE_SECRET. Nothing is copied yet: this
// only parks a ticket and hands back a page where she, signed in, chooses the matter. No OCR starts from here.
const ARYA = (process.env.ARYA_FILES_URL ?? "https://arya-files.tryklint.workers.dev").replace(/\/$/, "");

export async function POST(req: Request) {
  if (!process.env.BRIDGE_SECRET) return Response.json({ error: "Bridge not configured" }, { status: 503 });
  const raw = await req.text();
  if (!signedOk(raw, req.headers.get("x-bridge-signature"))) return Response.json({ error: "Bad signature" }, { status: 401 });
  let t: Omit<Ticket, "id">;
  try { t = JSON.parse(raw); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!(Math.abs(Date.now() - Date.parse(t.at)) < 5 * 60_000)) return Response.json({ error: "Stale request" }, { status: 401 });
  const files = (Array.isArray(t.files) ? t.files : []).filter((f: BridgeFile) =>
    typeof f?.url === "string" && f.url.startsWith(`${ARYA}/dl/`) && /^[0-9a-f]{64}$/.test(f.sha256) && Number.isFinite(f.size) && typeof f.name === "string");
  // Her OCR text link must come from Arya Files too, or it is dropped (the file is then read as usual).
  for (const f of files) if (f.ocr_url && !f.ocr_url.startsWith(`${ARYA}/dl/`)) delete f.ocr_url;
  if (!files.length) return Response.json({ error: "No files" }, { status: 400 });
  const id = randomUUID();
  await writeState(ticketAt(id), { id, folder_id: t.folder_id ?? null, folder: String(t.folder ?? "Arya Files"), by: String(t.by ?? ""), at: t.at, files } satisfies Ticket);
  return Response.json({ url: `${new URL(req.url).origin}/bridge/${id}` });
}
