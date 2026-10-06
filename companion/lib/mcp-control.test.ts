import { test } from "node:test";
import assert from "node:assert/strict";
import { editable, summarise, waiting, withText, type Control, type Write } from "./mcp-control.ts";

const note: Write = { tool: "add_note", matter: "m", doc: "d", title: "Complaint", page: 3, note: "check the date", quote: null, start: null, end: null, kind: "note", colour: "yellow" };
const hl: Write = { ...note, kind: "highlight", note: "", quote: "Section 18" };

test("a proposal says in one line what it would change", () => {
  assert.equal(summarise(note), 'Note on Complaint, p. 3: "check the date"');
  assert.match(summarise(hl), /^Highlight \(yellow\) on Complaint, p. 3 on "Section 18"$/);
  assert.match(summarise({ tool: "forget", id: "a1", text: "Dates as DD-MM-YYYY" }), /^Forget a memory: "Dates as DD-MM-YYYY"$/);
  assert.match(summarise({ tool: "correct_page", matter: "m", doc: "d", title: "Order", page: 2, text: "x", reason: null, revert: true }), /^Put back the first reading of Order, p. 2$/);
});

test("she can edit the words of a note, a memory or a corrected page, not a highlight or a forget", () => {
  assert.equal(editable(note), "check the date");
  assert.equal(editable(hl), null);
  assert.equal(editable({ tool: "forget", id: "a", text: "t" }), null);
  assert.equal(withText(note, "  sooner  ").tool === "add_note" && (withText(note, "  sooner  ") as typeof note).note, "sooner");
  assert.equal((withText({ tool: "remember", text: "a", matter: null }, "two\n  lines") as { text: string }).text, "two lines");
  assert.deepEqual(withText(hl, "ignored"), hl);
});

test("only proposals still waiting count as waiting", () => {
  const c: Control = { mode: "review", log: [], proposals: [
    { id: "1", at: "", w: note, summary: "", status: "waiting" }, { id: "2", at: "", w: note, summary: "", status: "approved" }, { id: "3", at: "", w: note, summary: "", status: "declined" }] };
  assert.deepEqual(waiting(c).map((p) => p.id), ["1"]);
});
