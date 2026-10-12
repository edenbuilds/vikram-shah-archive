import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanMarks } from "./marks.ts";

test("what the model sends is cut down to known kinds, plain short strings and at most twelve marks", () => {
  const raw = { marks: [
    { kind: "seal", what: "  Round notary seal\n with a star border ", text: "NOTARY GOVT. OF INDIA", where: "top right" },
    { kind: "hologram", what: "Something odd", text: "", where: "" },
    ...Array.from({ length: 20 }, (_, i) => ({ kind: "signature", what: `Signature ${i}`, text: null, where: "bottom" })),
  ] };
  const out = cleanMarks(raw);
  assert.equal(out.length, 12);
  assert.deepEqual(out[0], { kind: "seal", what: "Round notary seal with a star border", text: "NOTARY GOVT. OF INDIA", where: "top right" });
  assert.equal(out[1].kind, "other", "an unknown kind is kept as a plain mark, never as a made-up category");
  assert.equal(out[1].text, null);
});

test("a page with nothing on it gives an empty list, even when the model writes 'none' as if it were a mark", () => {
  assert.deepEqual(cleanMarks({ marks: [] }), []);
  assert.deepEqual(cleanMarks({ marks: [{ kind: "other", what: "None found on this page", text: null, where: "" }] }), []);
  assert.deepEqual(cleanMarks({ marks: [{ kind: "stamp", what: "No stamps or signatures", text: null, where: "" }] }), []);
  assert.deepEqual(cleanMarks("not json at all"), []);
  assert.deepEqual(cleanMarks(null), []);
});

test("the same mark reported twice is listed once and rows without a description are dropped", () => {
  const out = cleanMarks([
    { kind: "signature", what: "Signature above the word Deponent", where: "bottom right" },
    { kind: "signature", what: "signature above the word deponent", where: "Bottom right" },
    { kind: "stamp", what: "   ", where: "top" },
    "text", 4, null,
  ]);
  assert.equal(out.length, 1);
});
