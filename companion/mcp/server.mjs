#!/usr/bin/env node
// Read-only MCP server over the companion corpus, for Claude Code / Cursor sessions.
// Every tool returns source text with its pin (doc id + page) and never a synthesised
// summary. Advocate's notes are labelled as such so they can't pass for the paper.
//
//   claude mcp add case-companion -- node --env-file=/ABS/companion/.env.local /ABS/companion/mcp/server.mjs
//
// ponytail: uses the service-role key, so it sees every matter in the workspace; set
// COMPANION_MATTERS=id1,id2 to narrow it. Per-user auth when someone other than the owner runs it.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ONLY = (process.env.COMPANION_MATTERS || "").split(",").map((s) => s.trim()).filter(Boolean);
const NOTE = "Restates a party's papers. Not an award, not advice, not a finding.";
const pg = (a, b) => (a === b ? `p. ${a}` : `pp. ${a}-${b}`);

const allowed = async (matter) => {
  if (ONLY.length && !ONLY.includes(matter)) throw new Error(`matter ${matter} is outside COMPANION_MATTERS`);
};
const docMatter = async (docId) => {
  const { data } = await db.from("documents").select("id, matter_id, title, page_count").eq("id", docId).maybeSingle();
  if (!data) throw new Error(`no document ${docId}`);
  await allowed(data.matter_id);
  return data;
};
const text = (s) => ({ content: [{ type: "text", text: `${s}\n\n(${NOTE})` }] });

async function embed(q) {
  if (!process.env.OPENAI_API_KEY) return null;
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "text-embedding-3-small", input: q.slice(0, 8000) }),
  });
  return r.ok ? (await r.json()).data[0].embedding : null;
}

const server = new McpServer({ name: "case-companion", version: "0.1.0" });

server.registerTool("list_matters", {
  description: "List the matters (cases) in the advocate's workspace with forum and case number.",
  inputSchema: {},
}, async () => {
  let q = db.from("matters").select("id, title, kind, forum, cause");
  if (ONLY.length) q = q.in("id", ONLY);
  const { data, error } = await q;
  if (error) throw error;
  return text(data.map((m) => `${m.id} | ${m.title} | ${m.kind} | ${m.forum ?? ""} | ${m.cause ?? ""}`).join("\n"));
});

server.registerTool("search_documents", {
  description: "Search every page of a matter's papers. Returns verbatim passages, each pinned [doc_id, page].",
  inputSchema: { matter: z.string(), query: z.string(), limit: z.number().int().min(1).max(30).optional() },
}, async ({ matter, query, limit = 10 }) => {
  await allowed(matter);
  const vec = await embed(query);
  let rows;
  if (vec) {
    const { data, error } = await db.rpc("match_chunks", { query_embedding: vec, query_text: query, matter_ids: [matter], match_count: limit });
    if (error) throw error;
    rows = data;
  } else {
    const { data, error } = await db.from("chunks").select("doc_id, page_start, page_end, text").eq("matter_id", matter)
      .textSearch("tsv", query, { type: "websearch", config: "english" }).limit(limit);
    if (error) throw error;
    rows = data;
  }
  if (!rows.length) return text(`No passage in ${matter} matches "${query}". The papers on file do not show it.`);
  const { data: docs } = await db.from("documents").select("id, title").in("id", [...new Set(rows.map((r) => r.doc_id))]);
  const t = new Map(docs.map((d) => [d.id, d.title]));
  return text(rows.map((r) => `[${r.doc_id}, ${pg(r.page_start, r.page_end)}] ${t.get(r.doc_id)}\n${r.text}`).join("\n\n---\n\n"));
});

server.registerTool("get_document", {
  description: "Metadata for one paper: title, stage, pages, SHA-256, OCR source, sections with page ranges.",
  inputSchema: { doc_id: z.string() },
}, async ({ doc_id }) => {
  await docMatter(doc_id);
  const { data: d } = await db.from("documents").select("id, matter_id, stage, kind, title, filename, page_count, sha256, ocr_source, sections").eq("id", doc_id).single();
  const secs = (d.sections || []).map((s) => `  ${s.numeral ?? ""} ${s.title} (${s.pages ?? `${s.pageStart}-${s.pageEnd}`})`).join("\n");
  return text(`${d.title}\nid: ${d.id}\nmatter: ${d.matter_id}\nstage: ${d.stage}\nkind: ${d.kind ?? "n/a"}\npages: ${d.page_count}\nfile: ${d.filename}\nsha256: ${d.sha256}\nocr: ${d.ocr_source}\nsections:\n${secs}`);
});

server.registerTool("get_transcript", {
  description: "Verbatim page text of a paper, each page labelled [doc_id p. N]. Optional page range. [ILLEGIBLE] marks pages with no readable text.",
  inputSchema: { doc_id: z.string(), page_start: z.number().int().min(1).optional(), page_end: z.number().int().min(1).optional() },
}, async ({ doc_id, page_start, page_end }) => {
  const d = await docMatter(doc_id);
  const a = page_start ?? 1, b = Math.min(page_end ?? (page_start ? page_start : Math.min(d.page_count, 25)), d.page_count);
  const { data: pages } = await db.from("document_pages").select("page_no, text, text_source").eq("doc_id", doc_id).gte("page_no", a).lte("page_no", b).order("page_no");
  const body = pages.map((p) => `[${doc_id} p. ${p.page_no}]${p.text_source ? ` (${p.text_source})` : ""}\n${p.text ?? "[ILLEGIBLE: no readable text on this page; see the scan]"}`).join("\n\n");
  const more = b < d.page_count ? `\n\n(${d.page_count - b} more pages; pass page_start/page_end.)` : "";
  return text(`${d.title}\n\n${body}${more}`);
});

server.registerTool("get_chronology", {
  description: "The advocate's working chronology for a matter. Each entry shows its source paper+page, or is flagged as the advocate's own unsourced note.",
  inputSchema: { matter: z.string() },
}, async ({ matter }) => {
  await allowed(matter);
  const { data } = await db.from("chronology_entries").select("date, date_text, title, body, doc_id, page_no, hearing_id").eq("matter_id", matter)
    .order("date", { nullsFirst: false }).order("sort");
  if (!data.length) return text("No chronology entries yet.");
  return text(data.map((e) => {
    const src = e.doc_id ? `source: [${e.doc_id}${e.page_no ? ` p. ${e.page_no}` : ""}]` : e.hearing_id ? "source: advocate-reviewed hearing minutes" : "ADVOCATE'S OWN NOTE, not sourced to a filed paper";
    return `${e.date ?? e.date_text ?? "undated"} | ${e.title}${e.body ? ` | ${e.body}` : ""} | ${src}`;
  }).join("\n"));
});

server.registerTool("get_annotations", {
  description: "The advocate's own notes/tags on a paper. These are NOT source text.",
  inputSchema: { doc_id: z.string() },
}, async ({ doc_id }) => {
  await docMatter(doc_id);
  const { data } = await db.from("annotations").select("page_no, quote, body, tags, created_at").eq("doc_id", doc_id).order("created_at");
  if (!data.length) return text("No notes on this paper.");
  return text(data.map((n) => `ADVOCATE'S NOTE [${doc_id}${n.page_no ? ` p. ${n.page_no}` : ""}]${n.tags.length ? ` #${n.tags.join(" #")}` : ""}\n${n.quote ? `  on: "${n.quote}"\n` : ""}  ${n.body}`).join("\n\n"));
});

await server.connect(new StdioServerTransport());
