import { admin } from "./access.ts";
import { COLOURS, colourTag, type Colour } from "./highlight.ts";
import { correctPage, getHistory } from "./corrections.ts";
import { forget, remember, restore } from "./memory.ts";
import { markUndone, record, settle, type Control, type Entry, type Undo, type Write } from "./mcp-control.ts";

// The one place a connected app's write (or her approval of it) touches her data. Every write returns how to take it back.
export async function applyWrite(w: Write, email: string): Promise<Undo> {
  const db = admin();
  switch (w.tool) {
    case "add_note": {
      const { data: users } = await db.auth.admin.listUsers({ perPage: 1000 });
      const uid = users?.users.find((u) => u.email?.toLowerCase() === email)?.id;
      if (!uid) throw new Error("Could not identify the signed-in advocate");
      const tags = w.kind === "highlight" ? ["highlight", colourTag(COLOURS[w.colour as Colour] ?? COLOURS.yellow), "via-ai"] : w.kind === "bookmark" ? ["bookmark", "via-ai"] : ["via-ai"];
      const { data, error } = await db.from("annotations").insert({ matter_id: w.matter, doc_id: w.doc, page_no: w.page, char_start: w.start, char_end: w.end, quote: w.quote, body: w.note, tags, created_by: uid }).select("id").single();
      if (error) throw new Error(error.message);
      return { do: "delete_annotation", id: String(data.id) };
    }
    case "remember": { const m = await remember(email, w.text, w.matter, "ai"); return { do: "forget", id: m.id }; }
    case "forget": await forget(email, w.id); return { do: "restore", id: w.id };
    case "correct_page": {
      const r = await correctPage(db, { id: w.doc, matter_id: w.matter }, w.page, w.text, { by: email, reason: w.reason, via: w.revert ? "revert" : "ai" });
      if (r === "no such page") throw new Error("That page no longer exists");
      return w.revert || r === "unchanged" ? null : { do: "revert_page", doc: w.doc, page: w.page, matter: w.matter };
    }
  }
}

// Apply a queued proposal after she approved it (maybe edited); the log says it came by approval.
export async function approve(email: string, c: Control, id: string, w: Write): Promise<string | null> {
  const p = c.proposals.find((x) => x.id === id && (x.status === "waiting" || x.status === "failed"));
  if (!p) return "That change is no longer waiting.";
  try {
    const undo = await applyWrite(w, email);
    await record(email, w, undo, "approved");
    await settle(email, id, { status: "approved", w });
    return null;
  } catch (e) {
    await settle(email, id, { status: "failed", error: (e as Error).message.slice(0, 200) });
    return (e as Error).message;
  }
}

export async function undoEntry(email: string, e: Entry): Promise<void> {
  const u = e.undo;
  if (!u || e.undone) return;
  const db = admin();
  if (u.do === "delete_annotation") await db.from("annotations").delete().eq("id", u.id);
  else if (u.do === "forget") await forget(email, u.id);
  else if (u.do === "restore") await restore(email, u.id);
  else {
    const h = (await getHistory(u.doc))[u.page];
    if (h) await correctPage(db, { id: u.doc, matter_id: u.matter }, u.page, h.original, { by: email, reason: "undone from Settings", via: "revert" });
  }
  await markUndone(email, e.id);
}
