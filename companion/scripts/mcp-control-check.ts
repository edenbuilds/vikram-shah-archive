// What connected AI apps may do (06-10-2026, lib/mcp-control.ts), end to end through the real MCP endpoint:
// off refuses every write, review only queues (nothing changes until approval, and approval applies her edit), allow applies and logs
// an Undo, and forgetting is recoverable. Cleans up everything it made and puts her mode back.
// node --env-file=.env.local --experimental-strip-types scripts/mcp-control-check.ts <base-url> <email>
import { createHash, createHmac } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { admin, readState, writeState } from "../lib/access.ts";
import { getControl, setMode, withText } from "../lib/mcp-control.ts";
import { approve, undoEntry } from "../lib/mcp-writes.ts";
import { getMemory, getTrash } from "../lib/memory.ts";

const [base, email] = process.argv.slice(2);
const e = email.toLowerCase();
const token = `${Buffer.from(e).toString("base64url")}.${createHmac("sha256", process.env.COMPANION_LINK_SECRET!).update(`v1:${e}`).digest("base64url")}`;
const client = new Client({ name: "control-check", version: "1" });
await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/api/mcp/${token}`)));
const call = async (name: string, args: Record<string, unknown> = {}) => { const r = await client.callTool({ name, arguments: args }); return { text: (r.content as any)[0].text as string, err: !!r.isError }; };
const ok = (c: boolean, m: string) => { console.log(`${c ? "PASS" : "FAIL"} ${m}`); if (!c) process.exitCode = 1; };
const TAG = `control-check ${Date.now()}`;
const mine = async () => (await getMemory(e)).filter((m) => m.text.includes(TAG));
const was = (await getControl(e)).mode;
const doc = "statement-claim-22-01-25";
const since = new Date().toISOString();

try {
  await setMode(e, "off");
  const off = await call("remember", { text: `${TAG} off`, confirm: true });
  ok(off.err && /read-only/.test(off.text), "off: a write is refused");
  ok((await mine()).length === 0, "off: nothing was saved");
  ok(!(await call("list_matters")).err, "off: reading still works");

  await setMode(e, "review");
  ok(/WAITS for her approval/.test((await call("remember", { text: `${TAG} review` })).text), "review: a preview says the change will wait for her");
  const q = await call("remember", { text: `${TAG} review`, confirm: true });
  ok(/NOT SAVED YET/.test(q.text), "review: a confirmed write is only queued");
  ok((await mine()).length === 0, "review: nothing was saved by the AI app's own confirm");
  const note = await call("add_note", { doc_id: doc, page: 1, note: `${TAG} note`, confirm: true });
  ok(/NOT SAVED YET/.test(note.text), "review: a note is queued too");
  const { data: rows } = await admin().from("annotations").select("id").eq("doc_id", doc).gte("created_at", since);
  ok((rows ?? []).length === 0, "review: no annotation row was written");

  let c = await getControl(e);
  const waiting = c.proposals.filter((p) => p.status === "waiting" && JSON.stringify(p.w).includes(TAG));
  ok(waiting.length === 2, "review: both changes wait in the queue");
  const mem = waiting.find((p) => p.w.tool === "remember")!;
  ok(!(await approve(e, c, mem.id, withText(mem.w, `${TAG} edited by her`))), "approving applies it");
  ok((await mine()).map((m) => m.text).join("|") === `${TAG} edited by her`, "approving saves HER edited words, not the app's");
  c = await getControl(e);
  const entry = c.log.find((x) => x.summary.includes("edited by her"))!;
  ok(entry?.via === "approved" && entry.undo?.do === "forget", "the log says she approved it and how to undo it");
  await undoEntry(e, entry);
  ok((await mine()).length === 0 && (await getTrash(e)).some((g) => g.text.includes("edited by her")), "undo takes it out of her memory (it stays recoverable in the trash)");
  const note2 = c.proposals.find((p) => p.w.tool === "add_note" && JSON.stringify(p.w).includes(TAG))!;
  await (await import("../lib/mcp-control.ts")).settle(e, note2.id, { status: "declined" });
  ok((await getControl(e)).proposals.find((p) => p.id === note2.id)?.status === "declined", "declining leaves it unsaved");

  await setMode(e, "allow");
  const saved = await call("remember", { text: `${TAG} allow`, confirm: true });
  ok(/^Saved\./.test(saved.text) && (await mine()).length === 1, "allow: a confirmed write is applied");
  const id = (await mine())[0].id;
  const fg = await call("forget", { id, confirm: true });
  ok(/^Saved\./.test(fg.text) && (await mine()).length === 0, "allow: forget removes it from her memory");
  ok((await getTrash(e)).some((g) => g.id === id), "allow: ...but it is in Recently forgotten, not deleted");
  c = await getControl(e);
  const fgEntry = c.log.find((x) => x.undo?.do === "restore" && x.summary.includes(`${TAG} allow`))!;
  await undoEntry(e, fgEntry);
  ok((await mine()).length === 1, "undoing a forget puts the memory back");
  const hl = await call("add_note", { doc_id: doc, page: 1, note: `${TAG} note`, confirm: true });
  ok(/^Saved\./.test(hl.text), "allow: a note is saved");
  const { data: made } = await admin().from("annotations").select("id, tags").eq("doc_id", doc).gte("created_at", since);
  ok((made ?? []).length === 1 && made![0].tags.includes("via-ai"), "allow: the row is tagged via-ai");
  c = await getControl(e);
  await undoEntry(e, c.log.find((x) => x.undo?.do === "delete_annotation")!);
  ok(((await admin().from("annotations").select("id").eq("doc_id", doc).gte("created_at", since)).data ?? []).length === 0, "undoing a note deletes that note");
} finally {
  // leave nothing behind: her memory file (items and trash), any test annotation, and her own mode
  const path = `_system/memory/${createHash("sha256").update(e).digest("hex").slice(0, 32)}.json`;
  const f = await readState<{ items?: { text: string }[]; trash?: { text: string }[] }>(path, {});
  await writeState(path, { ...f, items: (f.items ?? []).filter((m) => !m.text.includes(TAG)), trash: (f.trash ?? []).filter((m) => !m.text.includes(TAG)), updated: new Date().toISOString() });
  for (const r of (await admin().from("annotations").select("id").eq("doc_id", doc).gte("created_at", since)).data ?? []) await admin().from("annotations").delete().eq("id", r.id);
  await setMode(e, was);
  // leave her real log and queue as they were: drop what this run added (everything at or after `since`)
  {
    const cp = `_system/mcp/${createHash("sha256").update(e).digest("hex").slice(0, 32)}.json`;
    const c = await readState<{ log?: { at: string }[]; proposals?: { at: string }[] }>(cp, {});
    await writeState(cp, { ...c, log: (c.log ?? []).filter((x) => x.at < since), proposals: (c.proposals ?? []).filter((x) => x.at < since) });
  }
  await client.close();
}
