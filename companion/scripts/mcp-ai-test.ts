// A real model driving the live MCP server (xAI Responses API remote-MCP tool, as ChatGPT does).
//   node --env-file=.env.local --experimental-strip-types scripts/mcp-ai-test.ts <mcp url> "<question>"
const [url, q] = process.argv.slice(2);
const r = await fetch("https://api.x.ai/v1/responses", {
  method: "POST",
  headers: { Authorization: `Bearer ${process.env.XAI_API_KEY}`, "content-type": "application/json" },
  body: JSON.stringify({ model: "grok-4.3", input: q, tools: [{ type: "mcp", server_label: "case_companion", server_url: url, require_approval: "never" }] }),
}).then((x) => x.json());
if (r.error) { console.log("ERROR", r.error); process.exit(1); }
for (const o of r.output ?? []) {
  if (o.type === "mcp_call") console.log(`[tool] ${o.name}(${o.arguments.slice(0, 120)})${o.error ? ` ERROR ${o.error}` : ""}`);
  if (o.type === "mcp_list_tools") console.log(`[listed ${o.tools.length} tools]`);
}
console.log("\n" + (r.output_text ?? r.output?.filter((o: any) => o.type === "message").map((o: any) => o.content.map((c: any) => c.text).join("")).join("\n")));
