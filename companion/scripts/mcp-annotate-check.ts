// MCP check (04-10-2026): a paper opened through the tools shows under "Where she left off", and a highlight and a bookmark
// saved through the tools are the same rows the app and the PDF export read. Removes what it saved.
// node --env-file=.env.local --experimental-strip-types scripts/mcp-annotate-check.ts <base-url> <email>
import { createHmac } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { admin } from "../lib/access.ts";

const [base, email] = process.argv.slice(2);
const e = email.toLowerCase();
const token = `${Buffer.from(e).toString("base64url")}.${createHmac("sha256", process.env.COMPANION_LINK_SECRET!).update(`v1:${e}`).digest("base64url")}`;
const client = new Client({ name: "annotate-check", version: "1" });
await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/api/mcp/${token}`)));
const call = async (name: string, args: Record<string, unknown> = {}) => ((await client.callTool({ name, arguments: args })).content as any)[0].text as string;
const ok = (c: boolean, m: string) => { console.log(`${c ? "PASS" : "FAIL"} ${m}`); if (!c) process.exitCode = 1; };

const doc = "statement-claim-22-01-25", quote = "Mr. Vikarm Shah";
const since = new Date().toISOString();
ok((client.getInstructions() ?? "").includes("No receipt, no statement"), "initialize carries the receipts rules");
await call("get_paper", { doc_id: doc });
await new Promise((r) => setTimeout(r, 2500));
const memory = await call("get_memory");
ok(/Where she left off/.test(memory) && /Statement of Claim/i.test(memory), "get_memory lists the paper just opened under Where she left off");
ok(/Where she left off/.test(await call("read_me_first")), "read_me_first lists where she left off");
ok(/PREVIEW/.test(await call("add_note", { doc_id: doc, page: 1, quote, highlight: true, colour: "green" })), "a highlight asks first (preview, nothing saved)");
ok(/Saved/.test(await call("add_note", { doc_id: doc, page: 1, quote, highlight: true, colour: "green", confirm: true })), "a confirmed highlight saves");
ok(/Saved/.test(await call("add_note", { doc_id: doc, page: 1, note: "mcp check bookmark", bookmark: true, confirm: true })), "a confirmed bookmark saves");
ok(/not in/.test(await call("add_note", { doc_id: doc, page: 1, quote: "words that are not there", highlight: true, confirm: true })), "a highlight on words that are not on the page is refused");

const { data } = await admin().from("annotations").select("id, tags, quote, body, char_start, char_end").eq("doc_id", doc).gte("created_at", since);
const hl = (data ?? []).find((r) => r.tags.includes("highlight")), bm = (data ?? []).find((r) => r.tags.includes("bookmark"));
ok(!!hl && hl.tags.some((t: string) => /^color:#[0-9a-f]{6}$/i.test(t)), "the highlight is an annotation row tagged highlight with a colour (what the app and the PDF export read)");
ok(!!hl && hl.char_end - hl.char_start === quote.length, "its offsets cover exactly the quoted words");
ok(!!bm && bm.body === "mcp check bookmark", "the bookmark is a bookmark row (listed with the paper in the app)");
ok(/Highlight|highlight/.test(await call("get_notes", { matter_id: "shah-v-trindade" })), "get_notes shows the highlight to her AI app");
for (const r of data ?? []) await admin().from("annotations").delete().eq("id", r.id);
console.log(`removed ${(data ?? []).length} check rows`);
await client.close();
