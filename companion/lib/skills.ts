import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readState, writeState } from "./access.ts";

// Skills the connected apps can use: the ones shipped with the app (skills/<name>/SKILL.md, plus the
// drafting pack with its own tools) and the ones she adds on Settings. Hers are kept in the private
// bucket, one JSON file each, so a skill is a set of Markdown files and nothing in it ever runs.

export type Skill = { name: string; description: string; files: Record<string, string>; by?: string; at?: string; builtIn?: boolean };
type Index = { name: string; description: string; by: string; at: string }[];

const ROOT = join(process.cwd(), "skills");
const INDEX = "_system/skills/index.json";
const at = (name: string) => `_system/skills/${name}.json`;
export const skillSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

/** name and description from a SKILL.md's frontmatter, else its first heading and line */
export function frontmatter(md: string, fallback: string): { name: string; description: string } {
  const fm = md.match(/^---\s*\n([\s\S]*?)\n---/)?.[1] ?? "";
  const get = (k: string) => fm.match(new RegExp(`^${k}:\\s*(.+)$`, "m"))?.[1].trim().replace(/^["']|["']$/g, "");
  const body = md.replace(/^---[\s\S]*?\n---\s*/, "");
  return {
    name: skillSlug(get("name") || body.match(/^#\s+(.+)$/m)?.[1] || fallback),
    description: (get("description") || body.split("\n").find((l) => l.trim() && !l.startsWith("#")) || "").slice(0, 600),
  };
}

let shipped: Skill[] | null = null;
function builtIn(): Skill[] {
  shipped ??= readdirSync(ROOT, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => {
    const md = readFileSync(join(ROOT, d.name, "SKILL.md"), "utf8");
    return { ...frontmatter(md, d.name), files: { "SKILL.md": md }, builtIn: true };
  });
  return shipped;
}

export async function listSkills(): Promise<Omit<Skill, "files">[]> {
  const hers = await readState<Index>(INDEX, []);
  return [...builtIn().map(({ files: _, ...s }) => s), ...hers];
}

export async function getSkill(name: string): Promise<Skill | null> {
  const n = skillSlug(name);
  return builtIn().find((s) => s.name === n) ?? (await readState<Skill | null>(at(n), null));
}

/** Save her skill from its Markdown files (path -> text). The main file is SKILL.md, else the first .md. */
export async function saveSkill(files: Record<string, string>, by: string): Promise<Skill> {
  const paths = Object.keys(files).filter((p) => /\.(md|markdown|txt|json)$/i.test(p));
  const main = paths.find((p) => /(^|\/)SKILL\.md$/i.test(p)) ?? paths.find((p) => /\.md$/i.test(p));
  if (!main) throw new Error("A skill needs a SKILL.md or another Markdown file.");
  const size = paths.reduce((a, p) => a + files[p].length, 0);
  if (size > 900_000) throw new Error("That skill is over 900 KB of text. Leave out the large files and try again.");
  const { name, description } = frontmatter(files[main], main.split("/").pop()!.replace(/\.\w+$/, ""));
  if (builtIn().some((s) => s.name === name)) throw new Error(`"${name}" is already a skill in the app. Rename yours in its frontmatter.`);
  // file paths relative to the main file's folder, so a zip of a skill folder reads the same as the folder
  const base = main.includes("/") ? main.slice(0, main.lastIndexOf("/") + 1) : "";
  const kept = Object.fromEntries(paths.map((p) => [p.startsWith(base) ? p.slice(base.length) : p, files[p]]));
  const skill: Skill = { name, description, files: kept, by, at: new Date().toISOString() };
  await writeState(at(name), skill);
  const idx = (await readState<Index>(INDEX, [])).filter((s) => s.name !== name);
  await writeState(INDEX, [...idx, { name, description, by, at: skill.at! }].sort((a, b) => a.name.localeCompare(b.name)));
  return skill;
}

export async function removeSkill(name: string) {
  await writeState(at(skillSlug(name)), null);
  await writeState(INDEX, (await readState<Index>(INDEX, [])).filter((s) => s.name !== skillSlug(name)));
}
