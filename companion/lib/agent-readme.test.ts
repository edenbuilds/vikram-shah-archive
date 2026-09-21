import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the agent guide documents every MCP tool the server registers, and the skill carries the same rules", () => {
  const server = readFileSync(new URL("./mcp.ts", import.meta.url), "utf8");
  const guide = readFileSync(new URL("./agent-readme.ts", import.meta.url), "utf8");
  const skill = readFileSync(new URL("../public/skill/case-companion/SKILL.md", import.meta.url), "utf8");
  const tools = [...server.matchAll(/registerTool\("([a-z_]+)"/g)].map((m) => m[1]);
  const looped = [...server.matchAll(/\["(get_[a-z]+)", "/g)].map((m) => m[1]);
  for (const t of [...tools, ...looped]) assert.ok(guide.includes(t), `guide is missing tool ${t}`);
  for (const rule of ["No receipt, no statement", "verify_quote", "Not found in the papers on file", "No theories", "[ILLEGIBLE]"]) {
    assert.ok(guide.includes(rule), `guide is missing: ${rule}`);
    assert.ok(skill.includes(rule), `skill is missing: ${rule}`);
  }
});
