import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { admin } from "@/lib/access";
import { runAgent } from "@/lib/agent";
import { isSpan, norm } from "@/lib/citations";
import { readme } from "@/lib/agent-readme";
import { pageLabel, printedFor } from "@/lib/printed";
import { DRAFTING_ASK, draftingFile, draftingFiles, draftingGuide } from "@/lib/drafting";
import { getReading, readingMarkdown } from "@/lib/reading";
import { getSkill, listSkills } from "@/lib/skills";

// The companion's MCP server: read-only over the advocate's own matters, every result pinned
// to paper + page, one checked write (a note) that needs an explicit confirm. Used by ChatGPT,
// Claude (web, Desktop, Code), Codex, Cursor and VS Code through one remote URL.

export { RULES } from "@/lib/agent-readme";

type Ctx = { email: string; matters: string[]; origin: string };
type Doc = { id: string; matter_id: string; title: string; stage: string; page_count: number; source_path: string | null; sections: unknown };

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
const fail = (t: string) => ({ content: [{ type: "text" as const, text: t }], isError: true });

export function register(server: McpServer, ctx: Ctx) {
  const db = admin();
  const link = (m: string, d: string, p?: number) => `${ctx.origin}/m/${m}/d/${d}${p ? `?p=${p}` : ""}`;
  const pin = (d: { matter_id: string; id: string; title: string }, p: number, printed?: number) => `[${d.title}, ${pageLabel(p, printed)}](${link(d.matter_id, d.id, p)})`;
  const scope = (m?: string) => (m ? (ctx.matters.includes(m) ? [m] : []) : ctx.matters);
  async function doc(id: string): Promise<Doc | null> {
    const { data } = await db.from("documents").select("id, matter_id, title, stage, page_count, source_path, sections").eq("id", id).maybeSingle();
    return data && ctx.matters.includes(data.matter_id) ? (data as Doc) : null;
  }
  const noMatter = (m: string) => fail(`No matter "${m}" in your workspace. Call list_matters to see the ids.`);

  server.registerTool("read_me_first", {
    title: "Read me first",
    description: "START HERE. The rules (no receipt, no statement; no guesses, no theories), how to work, what a receipt looks like, and what is in the advocate's workspace today (live).",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => text(await readme(db, ctx.matters, ctx.origin)));
  server.registerResource("readme", "case-companion://readme", { title: "Case Companion: guide for AI agents", mimeType: "text/markdown" },
    async (uri: URL) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: await readme(db, ctx.matters, ctx.origin) }] }));

  server.registerTool("list_matters", {
    title: "List matters",
    description: "List the advocate's matters (cases) with forum, case number, posture, paper and page counts and the next hearing. Start here to get matter ids.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => {
    const [{ data: ms }, { data: ds }, { data: hs }] = await Promise.all([
      db.from("matters").select("id, title, forum, cause, posture").in("id", ctx.matters).order("created_at"),
      db.from("documents").select("matter_id, page_count").in("matter_id", ctx.matters),
      db.from("hearings").select("matter_id, date, purpose").in("matter_id", ctx.matters).eq("status", "upcoming").order("date"),
    ]);
    if (!ms?.length) return text("No matters in this workspace yet.");
    return text(ms.map((m) => {
      const d = (ds ?? []).filter((x) => x.matter_id === m.id);
      const h = (hs ?? []).find((x) => x.matter_id === m.id);
      return [`## ${m.title}`, `id: ${m.id}`, m.forum && `forum: ${m.forum}`, m.cause && `case: ${m.cause}`, m.posture && `posture (advocate's note): ${m.posture}`,
        `papers: ${d.length}, pages: ${d.reduce((a, x) => a + x.page_count, 0)}`, h && `next hearing: ${h.date}${h.purpose ? ` (${h.purpose})` : ""}`,
        `open: ${ctx.origin}/m/${m.id}`].filter(Boolean).join("\n");
    }).join("\n\n"));
  });

  server.registerTool("list_papers", {
    title: "List papers in a matter",
    description: "List every paper filed in a matter, grouped by stage, with paper ids, page counts and where each came from.",
    inputSchema: { matter_id: z.string().describe("From list_matters") },
    annotations: { readOnlyHint: true },
  }, async ({ matter_id }) => {
    if (!scope(matter_id).length) return noMatter(matter_id);
    const [{ data: m }, { data: ds }] = await Promise.all([
      db.from("matters").select("title, stages").eq("id", matter_id).single(),
      db.from("documents").select("id, title, stage, page_count, source_path").eq("matter_id", matter_id).order("sort"),
    ]);
    const stages = (m?.stages ?? []) as { id: string; title: string }[];
    const out = stages.map((s) => {
      const xs = (ds ?? []).filter((d) => d.stage === s.id);
      return xs.length ? `### ${s.title}\n${xs.map((d) => `- ${d.title} (${d.page_count} pp.) id: ${d.id}${d.source_path && d.source_path.includes(", p") ? `, from ${d.source_path}` : ""}`).join("\n")}` : "";
    }).filter(Boolean);
    return text(`# ${m?.title}\n${out.join("\n\n") || "No papers filed yet."}`);
  });

  server.registerTool("get_paper", {
    title: "Get a paper's details",
    description: "A paper's title, stage, page count, source volume and its contents (sections with page ranges). Use read_pages for its text.",
    inputSchema: { doc_id: z.string() },
    annotations: { readOnlyHint: true },
  }, async ({ doc_id }) => {
    const d = await doc(doc_id);
    if (!d) return fail(`No paper "${doc_id}" in your workspace.`);
    const secs = ((d.sections ?? []) as { numeral?: string; title?: string; mark?: string; pages?: string }[])
      .map((s) => `- ${s.numeral ?? ""} ${(s.mark && s.mark !== "—" ? s.mark : s.title ?? "").replace(/^[#>]+\s*/, "").slice(0, 120)} (p. ${s.pages})`);
    return text([`# ${d.title}`, `id: ${d.id}`, `matter: ${d.matter_id}`, `stage: ${d.stage}`, `pages: ${d.page_count}`,
      d.source_path && `source: ${d.source_path}`, `open: ${link(d.matter_id, d.id)}`, secs.length ? `\nContents:\n${secs.join("\n")}` : ""].filter(Boolean).join("\n"));
  });

  server.registerTool("read_pages", {
    title: "Read pages verbatim",
    description: "The verbatim OCR text of pages of a paper (up to 15 per call), each labelled with its pin. Quote from this text exactly.",
    inputSchema: { doc_id: z.string(), from_page: z.number().int().min(1), to_page: z.number().int().min(1).optional() },
    annotations: { readOnlyHint: true },
  }, async ({ doc_id, from_page, to_page }) => {
    const d = await doc(doc_id);
    if (!d) return fail(`No paper "${doc_id}" in your workspace.`);
    const to = Math.min(to_page ?? from_page, from_page + 14, d.page_count);
    if (from_page > d.page_count) return fail(`"${d.title}" has ${d.page_count} pages.`);
    const [{ data }, printed] = await Promise.all([
      db.from("document_pages").select("page_no, text").eq("doc_id", d.id).gte("page_no", from_page).lte("page_no", to).order("page_no"),
      printedFor(db, d.matter_id),
    ]);
    const body = (data ?? []).map((p) => `--- ${pin(d, p.page_no, printed[d.id]?.[p.page_no])} ---\n${p.text?.trim() || "[ILLEGIBLE: no text could be read from this page]"}`).join("\n\n");
    return text(`${body}${to < d.page_count ? `\n\n(${d.page_count} pages in all; continue with from_page ${to + 1}.)` : ""}`);
  });

  server.registerTool("search_papers", {
    title: "Search the papers",
    description: "Find passages in the papers by meaning and by exact words. Returns verbatim excerpts with pins. Optionally limit to one matter.",
    inputSchema: { query: z.string().min(2), matter_id: z.string().optional() },
    annotations: { readOnlyHint: true },
  }, async ({ query, matter_id }) => {
    const ids = scope(matter_id);
    if (!ids.length) return matter_id ? noMatter(matter_id) : text("No matters in this workspace yet.");
    const hits = await searchHits(query, ids, 10);
    if (!hits.length) return text("Not found in the papers on file.");
    return text(hits.map((h) => `${h.pin}\n> ${h.text.slice(0, 700).replace(/\n/g, "\n> ")}`).join("\n\n"));
  });

  server.registerTool("ask_papers", {
    title: "Ask the papers (verified answer)",
    description: "Answer a question from the papers with Case Companion's own checker: every claim comes with a verbatim quote verified against the page, or the answer is 'not in the papers'. Prefer this for factual questions.",
    inputSchema: { question: z.string().min(3), matter_id: z.string().optional() },
    annotations: { readOnlyHint: true },
  }, async ({ question, matter_id }) => {
    const ids = scope(matter_id);
    if (!ids.length) return matter_id ? noMatter(matter_id) : text("No matters in this workspace yet.");
    // same agent as the Ask button and Telegram: searches, reads, then every quote is checked
    const r = await runAgent(db, question, { matterIds: ids, docIds: null }, [], () => {});
    if (r.status !== "answered") return text(`Not found in the papers on file.${r.rejected.length ? ` (${r.rejected.length} draft statement(s) were withheld because their quotes did not match the papers.)` : ""}`);
    const docs = new Map<string, Doc>();
    for (const c of r.claims.flatMap((c) => c.citations)) if (!docs.has(c.doc_id)) { const d = await doc(c.doc_id); if (d) docs.set(d.id, d); }
    return text(r.claims.map((c) => `${c.text}\n${c.citations.map((q) => {
      const d = docs.get(q.doc_id);
      return `  - "${q.quote.replace(/\s+/g, " ")}" ${d ? pin(d, q.page_start) : `[${q.doc_id}, p. ${q.page_start}]`}`;
    }).join("\n")}`).join("\n\n") + "\n\n(Every quote above was checked against the page text.)");
  });

  server.registerTool("verify_quote", {
    title: "Verify a quote",
    description: "Check that a quote appears verbatim (ignoring spacing and punctuation) on a given page, or anywhere in the paper. Use before relying on any quote.",
    inputSchema: { doc_id: z.string(), quote: z.string().min(8), page: z.number().int().min(1).optional() },
    annotations: { readOnlyHint: true },
  }, async ({ doc_id, quote, page }) => {
    const d = await doc(doc_id);
    if (!d) return fail(`No paper "${doc_id}" in your workspace.`);
    const { data } = await db.from("document_pages").select("page_no, text").eq("doc_id", d.id).order("page_no");
    const pages = data ?? [];
    const on = pages.filter((p) => isSpan(quote, p.text ?? "", 8)).map((p) => p.page_no);
    // a quote may run across a page break
    const across = !on.length && pages.some((p, i) => i + 1 < pages.length && norm(`${p.text ?? ""} ${pages[i + 1].text ?? ""}`).includes(norm(quote)))
      ? pages.filter((p, i) => i + 1 < pages.length && norm(`${p.text ?? ""} ${pages[i + 1].text ?? ""}`).includes(norm(quote))).map((p) => p.page_no) : [];
    if (page && on.includes(page)) return text(`VERIFIED: the quote is on ${pin(d, page)}.`);
    if (on.length) return text(`${page ? `NOT on p. ${page}. ` : ""}VERIFIED on ${on.map((n) => pin(d, n)).join(", ")}. Cite that page instead.`);
    if (across.length) return text(`VERIFIED across a page break: starts on ${pin(d, across[0])}, continues on p. ${across[0] + 1}.`);
    return text(`NOT FOUND: this quote does not appear in "${d.title}". Do not use it. Use read_pages to copy the exact words.`);
  });

  for (const [name, table, cols, label] of [
    ["get_chronology", "chronology_entries", "date, date_text, title, body, doc_id, page_no", "the advocate's chronology"],
    ["get_hearings", "hearings", "date, forum, purpose, status", "hearings recorded by the advocate"],
  ] as const) {
    server.registerTool(name, {
      title: name === "get_chronology" ? "Get the chronology" : "Get hearings",
      description: `${label[0].toUpperCase()}${label.slice(1)} for a matter. This is her work product; pinned entries point to the paper and page.`,
      inputSchema: { matter_id: z.string() },
      annotations: { readOnlyHint: true },
    }, async ({ matter_id }) => {
      if (!scope(matter_id).length) return noMatter(matter_id);
      const { data } = await db.from(table).select(cols).eq("matter_id", matter_id).order("date", { ascending: true });
      const rows = (data ?? []) as unknown as Record<string, string | number | null>[];
      if (!rows.length) return text(`No entries in ${label} yet.`);
      return text(`(${label}; not the record itself)\n` + rows.map((r) => "- " + Object.entries(r).filter(([, v]) => v !== null && v !== "")
        .map(([k, v]) => (k === "doc_id" ? `source: ${link(matter_id, String(v), (r.page_no as number) ?? undefined)}` : k === "page_no" ? "" : `${k}: ${v}`)).filter(Boolean).join(" | ")).join("\n"));
    });
  }

  server.registerTool("get_notes", {
    title: "Get the advocate's notes",
    description: "The advocate's own notes on the papers (her work product, not the record), optionally for one paper.",
    inputSchema: { matter_id: z.string(), doc_id: z.string().optional() },
    annotations: { readOnlyHint: true },
  }, async ({ matter_id, doc_id }) => {
    if (!scope(matter_id).length) return noMatter(matter_id);
    let q = db.from("annotations").select("doc_id, page_no, quote, body, tags, created_at").eq("matter_id", matter_id).order("created_at");
    if (doc_id) q = q.eq("doc_id", doc_id);
    const { data } = await q;
    if (!data?.length) return text("No notes yet.");
    return text("(the advocate's notes, not the record)\n" + data.map((n) => `- ${n.body}${n.quote ? `\n  on: "${n.quote.slice(0, 200)}"` : ""}\n  ${link(matter_id, n.doc_id, n.page_no ?? undefined)}${n.tags?.length ? `  tags: ${n.tags.join(", ")}` : ""}`).join("\n"));
  });

  server.registerTool("add_note", {
    title: "Save a note on a paper (asks first)",
    description: "Save the advocate's note on a paper page, optionally anchored to an exact quote. First call WITHOUT confirm to get a preview; show it to her; call again with confirm: true only after she says yes.",
    inputSchema: { doc_id: z.string(), page: z.number().int().min(1), note: z.string().min(2), quote: z.string().optional(), confirm: z.boolean().optional() },
  }, async ({ doc_id, page, note, quote, confirm }) => {
    const d = await doc(doc_id);
    if (!d) return fail(`No paper "${doc_id}" in your workspace.`);
    if (page > d.page_count) return fail(`"${d.title}" has ${d.page_count} pages.`);
    let start: number | null = null, end: number | null = null;
    if (quote) {
      const { data: full } = await db.from("documents").select("transcript").eq("id", d.id).single();
      const t = full?.transcript ?? "";
      const at = t.indexOf(quote);
      if (at < 0) return fail(`The quote is not in "${d.title}" exactly as written. Use read_pages and copy the words exactly, or save the note without a quote.`);
      start = at; end = at + quote.length;
    }
    const preview = `Note on ${pin(d, page)}:\n"${note}"${quote ? `\nanchored to: "${quote}"` : ""}`;
    if (!confirm) return text(`PREVIEW (nothing saved yet). Show this to the advocate and ask if she wants it saved:\n\n${preview}`);
    const { data: users } = await db.auth.admin.listUsers({ perPage: 1000 });
    const uid = users?.users.find((u) => u.email?.toLowerCase() === ctx.email)?.id;
    if (!uid) return fail("Could not identify the signed-in advocate; nothing saved.");
    const { error } = await db.from("annotations").insert({ matter_id: d.matter_id, doc_id: d.id, page_no: page, char_start: start, char_end: end, quote: quote ?? null, body: note, tags: ["via-ai"], created_by: uid });
    return error ? fail(`Not saved: ${error.message}`) : text(`Saved.\n${preview}`);
  });

  // ChatGPT connectors and deep research look for tools named exactly `search` and `fetch`.
  server.registerTool("search", {
    title: "Search (ChatGPT)",
    description: "Search the advocate's case papers. Returns result ids for fetch.",
    inputSchema: { query: z.string() },
    annotations: { readOnlyHint: true },
  }, async ({ query }) => {
    const hits = await searchHits(query, ctx.matters, 10);
    return text(JSON.stringify({ results: hits.map((h) => ({ id: `${h.doc_id}#p${h.page}`, title: `${h.title}, p. ${h.page}`, url: link(h.matter_id, h.doc_id, h.page) })) }));
  });
  server.registerTool("fetch", {
    title: "Fetch (ChatGPT)",
    description: "Fetch the verbatim text of a search result (a paper page) by id.",
    inputSchema: { id: z.string() },
    annotations: { readOnlyHint: true },
  }, async ({ id }) => {
    const [docId, p] = id.split("#p");
    const d = await doc(docId);
    if (!d) return fail(`No result "${id}".`);
    const n = Math.max(1, Number(p) || 1);
    const { data } = await db.from("document_pages").select("text").eq("doc_id", d.id).eq("page_no", n).maybeSingle();
    return text(JSON.stringify({ id, title: `${d.title}, p. ${n}`, text: data?.text?.trim() || "[ILLEGIBLE]", url: link(d.matter_id, d.id, n), metadata: { matter: d.matter_id, page: n } }));
  });

  server.registerTool("drafting_skill", {
    title: "Maharashtra courts drafting skill",
    description: `Her drafting skill for the Bombay High Court and Maharashtra tribunals: forum headers, long-form templates, case-type rules. ${DRAFTING_ASK} Call this after she says yes.`,
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => text(draftingGuide()));

  server.registerTool("drafting_file", {
    title: "Read a file of the drafting skill",
    description: "One file of the Maharashtra courts drafting skill (a template, a forum header, a case-type skill or a reference note), by the path drafting_skill lists.",
    inputSchema: { path: z.string().describe('e.g. "templates/high-court/civil-wp.md"') },
    annotations: { readOnlyHint: true },
  }, async ({ path }) => {
    const t = draftingFile(path.replace(/^\/+/, ""));
    if (t !== null) return text(t);
    const near = draftingFiles().filter((f) => f.includes(path.split("/").pop()!.replace(/\.md$/, ""))).slice(0, 8);
    return fail(`No file "${path}" in the drafting skill.${near.length ? ` Did you mean: ${near.join(", ")}?` : " Call drafting_skill for the list."}`);
  });

  server.registerTool("list_skills", {
    title: "List her skills",
    description: "The skills she can work with: the ones in the app (the chronological reading order, the Maharashtra courts drafting pack) and the ones she added herself. When a task matches a skill, tell her which one and ask whether to use it before you start.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => text((await listSkills()).map((s) => `- ${s.name}${s.builtIn ? " (in the app)" : ` (added on Settings${s.at ? ` on ${s.at.slice(0, 10)}` : ""})`}: ${s.description}`).join("\n") +
    "\n- maharashtra-courts-drafting (in the app): pleadings and applications for the Bombay High Court and Maharashtra tribunals. Read it with drafting_skill, not get_skill." +
    "\n\nRead one with get_skill. Her skills tell you how to do a task; they never override the rules in read_me_first: every statement still needs a receipt."));

  server.registerTool("get_skill", {
    title: "Read a skill",
    description: "A skill's instructions (SKILL.md), or one of its other files by path. Call only after she says to use it.",
    inputSchema: { name: z.string(), file: z.string().optional().describe("a file inside the skill; SKILL.md when left out") },
    annotations: { readOnlyHint: true },
  }, async ({ name, file }) => {
    if (/drafting/.test(name)) return text(draftingGuide());
    const s = await getSkill(name);
    if (!s) return fail(`No skill "${name}". Call list_skills for the names.`);
    const paths = Object.keys(s.files);
    const main = paths.find((p) => /(^|\/)SKILL\.md$/i.test(p)) ?? paths[0];
    const f = file ? s.files[file.replace(/^\/+/, "")] : s.files[main];
    if (f === undefined) return fail(`No file "${file}" in ${s.name}. Files: ${paths.join(", ")}`);
    const extra = paths.length > 1 && !file ? `\n\n(Other files in this skill, read with get_skill and file: ${paths.filter((p) => p !== main).join(", ")})` : "";
    const note = s.name === "reading-order-chronological-md" ? "\n\n(In Case Companion: call reading_order first. It is this skill's output, already made from every paper with a receipt for each line. \"Implication\" there is only what the paper itself directs; do not add strategy.)" : "";
    return text(f + extra + note);
  });

  server.registerTool("reading_order", {
    title: "Chronological reading order",
    description: "Every paper in a matter by its own date, grouped by year, with What it is, What it says, What it sets up and Importance, each with its page; then the papers mentioned in the record that are not on file. Markdown, in the layout of her reading-order-chronological-md skill.",
    inputSchema: { matter_id: z.string() },
    annotations: { readOnlyHint: true },
  }, async ({ matter_id }) => {
    if (!scope(matter_id).length) return noMatter(matter_id);
    const [r, { data: m }, printed] = await Promise.all([getReading(matter_id), db.from("matters").select("title, forum, cause").eq("id", matter_id).maybeSingle(), printedFor(db, matter_id)]);
    if (!r) return text(`The reading order for this matter has not been made yet. She can make it at ${ctx.origin}/m/${matter_id}/reading (a few minutes).`);
    const titles = new Map(r.entries.map((e) => [e.doc, e.title]));
    const md = readingMarkdown(r, m?.title ?? matter_id, [m?.forum, m?.cause].filter(Boolean).join(", "), (d, p) => `[${titles.get(d) ?? d}, ${pageLabel(p, printed[d]?.[p])}](${link(matter_id, d, p)})`);
    return text((r.left ? `(${r.left} papers are not read yet; the list below is partial)\n\n` : "") + md);
  });

  for (const p of PROMPTS) {
    server.registerPrompt(p.name, {
      title: p.title,
      description: p.description,
      argsSchema: Object.fromEntries(p.args.map((a) => [a, z.string().describe(a === "matter" ? "Matter id or name" : a)])),
    }, (args: Record<string, string>) => ({ messages: [{ role: "user" as const, content: { type: "text" as const, text: fill(p.text, args) } }] }));
  }

  async function searchHits(query: string, ids: string[], k: number) {
    const { embed } = await import("@/lib/ai");
    const { data } = await db.rpc("match_chunks", { query_embedding: await embed(query), query_text: query, matter_ids: ids, match_count: k });
    const hits = (data ?? []) as { doc_id: string; matter_id: string; page_start: number; text: string; similarity: number; fts_rank: number }[];
    const good = hits.filter((h) => h.similarity >= 0.3 || h.fts_rank > 0);
    const { data: ds } = await db.from("documents").select("id, title, matter_id").in("id", [...new Set(good.map((h) => h.doc_id))]);
    const printed = Object.assign({}, ...(await Promise.all([...new Set(good.map((h) => h.matter_id))].map((m) => printedFor(db, m))))) as Record<string, Record<number, number>>;
    return good.map((h) => {
      const d = (ds ?? []).find((x) => x.id === h.doc_id)!;
      return { doc_id: h.doc_id, matter_id: h.matter_id, page: h.page_start, title: d?.title ?? h.doc_id, text: h.text, pin: pin({ ...d, id: h.doc_id, matter_id: h.matter_id, title: d?.title ?? h.doc_id }, h.page_start, printed[h.doc_id]?.[h.page_start]) };
    });
  }
}

export const fill = (t: string, args: Record<string, string>) => t.replace(/\{(\w+)\}/g, (_, k) => args[k] ?? `{${k}}`);

// Research prompts: exposed as MCP prompts and as one-click copies on the Connect page.
export const PROMPTS = [
  { name: "hearing_brief", title: "Prepare for the next hearing", args: ["matter"], description: "A pinned brief for the next hearing.",
    text: "Using Case Companion, prepare me for the next hearing in {matter}. Start with list_matters and get_hearings. Then set out: what is listed and why, the orders so far, each side's stand as their own papers put it, and the documents I will need, with every point quoted and pinned to paper and page. Where the papers are silent, write 'not in the papers' and list it as an open question for me. Do not add facts, law, predictions or views of your own." },
  { name: "list_of_dates", title: "Build a list of dates", args: ["matter"], description: "Every dated event from the papers, pinned.",
    text: "From the papers in {matter}, build a list of dates: every event with a date as printed, one line each, oldest first, each with a verbatim quote and its paper and page. Use search_papers and read_pages, and verify_quote before each entry. Where a date is unclear or conflicts between papers, show both and flag it; do not resolve it yourself." },
  { name: "paper_summary", title: "Summarise one paper", args: ["paper"], description: "What a single paper says, section by section.",
    text: "Summarise the paper \"{paper}\" in Case Companion. Find it with list_papers, then get_paper and read_pages. Go section by section: what it is, who files it, what it asks for, the key facts it asserts, and what it annexes, with every point pinned to a page. Quote rather than paraphrase figures, dates and names." },
  { name: "compare_positions", title: "Compare both sides on an issue", args: ["matter", "issue"], description: "Each side's stand on one issue, side by side.",
    text: "In {matter}, set out each party's position on this issue: {issue}. Use search_papers and ask_papers. For each party, quote what their own papers say, pinned to paper and page. Then list where the papers agree, where they conflict, and what neither side's papers address. Do not say which side is right or offer a view of your own." },
  { name: "check_statement", title: "Check a statement against the papers", args: ["statement"], description: "Is this supported, contradicted, or absent?",
    text: "Check this statement against the papers in Case Companion: \"{statement}\". Answer SUPPORTED, CONTRADICTED, or NOT IN THE PAPERS, then show the exact quotes with paper and page (verify each with verify_quote). If it is partly supported, say which part." },
  { name: "cross_points", title: "Points for cross-examination", args: ["matter", "witness"], description: "Inconsistencies in a witness's or party's own papers.",
    text: "In {matter}, find points for cross-examining {witness}: places where their own papers are inconsistent with each other, with the documents they annex, or with the other side's documents. For each point give both quotes, pinned to paper and page, verified with verify_quote. Do not suggest questions based on facts that are not in the papers." },
  { name: "draft", title: "Draft a document", args: ["matter", "document"], description: "A draft built from the papers, with her skill and her reference.",
    text: "I want to draft {document} in {matter}. Before you write anything, ask me two questions and wait for my answers: (1) should you use the Maharashtra courts drafting skill (drafting_skill)? (2) do I have a reference document you should follow, either a paper in the workspace or a file I share? Then take every fact from the papers with search_papers, read_pages and verify_quote, keep a receipt for each, and leave a bracketed blank for anything the papers do not give. Do not invent citations, fees, limitation, dates or amounts." },
  { name: "reading_order", title: "Chronological reading order", args: ["matter"], description: "Every paper by its own date, as a Markdown file.",
    text: "Give me the chronological reading order for {matter} as a Markdown file. Call reading_order and use it as it is: every paper by its own date, grouped by year, What it is, What it says, What it sets up and Importance, each with its page, then Documents Still Needed. If it has not been made, tell me where to make it. Do not add strategy or implications of your own." },
] as const;
