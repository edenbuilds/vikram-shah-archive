import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// The Maharashtra courts drafting pack (her own skill, copied verbatim into drafting/), served over
// the MCP so any agent drafting for her uses the same templates, forum headers and rules.
// next.config.ts traces drafting/ into the MCP function, since serverless has no repo checkout.

const ROOT = join(process.cwd(), "drafting", "maharashtra-courts-drafting");

let files: string[] | null = null;
/** Every file in the pack, as paths relative to its root ("templates/high-court/pil.md"). */
export function draftingFiles(): string[] {
  files ??= (readdirSync(ROOT, { recursive: true, withFileTypes: true }) as import("node:fs").Dirent[])
    .filter((e) => e.isFile() && /\.(md|json)$/.test(e.name))
    .map((e) => join(e.parentPath, e.name).slice(ROOT.length + 1))
    .sort();
  return files;
}

/** One file of the pack; only paths from draftingFiles() are served. */
export const draftingFile = (path: string) => (draftingFiles().includes(path) ? readFileSync(join(ROOT, path), "utf8") : null);

export const DRAFTING_ASK = `Before drafting anything for her, ask two things and wait for her answers:
1. "Shall I use the Maharashtra courts drafting skill for this?"
2. "Do you have a reference document I should follow? It can be a paper in the workspace or a file you share."`;

/** The skill's front page: how to use it here, then its own SKILL.md, then the index of files. */
export function draftingGuide(): string {
  const all = draftingFiles();
  const group = (dir: string) => all.filter((f) => f.startsWith(dir)).map((f) => `- ${f}`).join("\n");
  return `# Maharashtra courts drafting skill

${DRAFTING_ASK}

## Using it with Case Companion

- Facts in the draft come from her papers (search_papers, read_pages, verify_quote) or from her. Each
  fact you take from the papers keeps its receipt in your working notes, so she can check it.
- With a reference document: follow its structure, headings, cause title, numbering and register.
  Take nothing factual from it about this matter; the facts come from this matter's papers.
- Without one: load the forum exemplar, then the long-form template, then the case-type skill, as below.
- Never invent a citation, a fee, a limitation article, a date or an amount. Leave a blank with a
  bracketed note for her to fill.
- The draft is a starting point for her; say what she must still supply.

Read any file below with drafting_file.

${draftingFile("grok-skill/SKILL.md") ?? ""}

## Files

### Case-type skills
${group("skills/")}

### Long-form templates
${group("templates/")}

### Forum headers and house style
${group("forum-config/")}

### References
${group("references/")}

### Pipeline stages
${group("agents/")}
`;
}
