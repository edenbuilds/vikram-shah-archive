import { test } from "node:test";
import assert from "node:assert/strict";
import { frontmatter, getSkill } from "./skills.ts";
import { readingMarkdown, type ReadingOrder } from "./reading.ts";

test("a skill is named by its frontmatter, or by its first heading when it has none", () => {
  assert.deepEqual(frontmatter("---\nname: My Notice Skill\ndescription: \"Drafts notices\"\n---\n# x", "f"), { name: "my-notice-skill", description: "Drafts notices" });
  assert.equal(frontmatter("# Cross points\nFinds inconsistencies.", "f").name, "cross-points");
});

test("the reading-order skill ships with the app", async () => {
  const s = await getSkill("reading-order-chronological-md");
  assert.ok(s?.builtIn && s.files["SKILL.md"].includes("Documents Still Needed"));
});

test("the reading order file groups papers by year, undated last, each field with its page", () => {
  const f = (text: string) => ({ text, page: 2, quote: "the quoted words" });
  const e = (doc: string, iso: string | null) => ({ doc, title: doc, iso, printed: null, what: f("An order"), says: f("It allows"), sets: null, importance: "High" as const, mentions: [] });
  const r: ReadingOrder = { made_at: "", basis: { papers: 3, last: "" }, left: 0, entries: [e("a", "2019-03-12"), e("b", "2021-01-01"), e("c", null)],
    needed: [{ tier: "Critical", item: "Agreement for sale", doc: "a", page: 2, quote: "the agreement" }] };
  const md = readingMarkdown(r, "X v Y", "Tribunal", (d, p) => `${d}, p. ${p}`);
  assert.ok(md.indexOf("## 2019") < md.indexOf("## 2021") && md.indexOf("## 2021") < md.indexOf("## Undated"));
  assert.match(md, /### 12\.03\.2019 — a/);
  assert.match(md, /\*\*What it sets up:\*\* Not found in the papers on file\./);
  assert.match(md, /- Agreement for sale: mentioned in a, p\. 2/);
});
