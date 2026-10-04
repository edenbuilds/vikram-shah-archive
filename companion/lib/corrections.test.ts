import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkText, replacePage, splitMarkdown } from "./corrections.ts";

test("an edited Markdown download splits back into its pages", () => {
  const md = "# Appeal\n\n_3 pages_\n\n## Page 1\n\nFirst page.\n\n## Page 2\n\nSecond\n\npage.\n\n## Page 3 of 3\n\n[ILLEGIBLE: no text]\n";
  const p = splitMarkdown(md);
  assert.deepEqual([...p.keys()], [1, 2, 3]);
  assert.equal(p.get(2), "Second\n\npage.");
  assert.equal(splitMarkdown("no headings here").size, 0);
});

test("one page of the transcript is replaced and the others are left alone", () => {
  const t = "## Page 1 of 2\n\nold one\n\n---\n\n## Page 2 of 2\n\nold two\n\n---\n";
  assert.equal(replacePage(t, 2, "new two"), "## Page 1 of 2\n\nold one\n\n---\n\n## Page 2 of 2\n\nnew two\n\n---\n");
  assert.equal(replacePage("unkeyed transcript", 1, "x"), null);
});

test("corrected text is cut into search passages the same way the worker cuts pages", () => {
  const para = "word ".repeat(120).trim(); // 599 chars
  assert.equal(chunkText(`${para}\n\n${para}`).length, 2);
  assert.equal(chunkText("short\n\nbits").length, 0);
  assert.ok(chunkText("line of text here\n".repeat(200)).every((c) => c.length <= 1600 + 20));
});
