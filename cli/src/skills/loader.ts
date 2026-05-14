import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import matter from "gray-matter";
import { embeddedContentDir, paths, workspaceDirsInPriority } from "../utils/paths.js";
import { fileExists, readText } from "../utils/files.js";

export interface Skill {
  /** Slug like "core/locators" or "ci/parallel-and-sharding". */
  id: string;
  /** Top-level pack name, e.g. "core", "ci", "pom". */
  pack: string;
  /** Leaf name without extension. */
  name: string;
  description: string;
  source: "embedded" | "workspace" | "user";
  path: string;
  body: string;
  frontmatter: Record<string, unknown>;
}

interface SkillsIndex {
  byId: Map<string, Skill>;
  list: Skill[];
}

export async function loadSkills(cwd: string = process.cwd()): Promise<SkillsIndex> {
  const byId = new Map<string, Skill>();

  const embeddedDir = join(embeddedContentDir(), "skills");
  if (fileExists(embeddedDir)) {
    for (const s of await scanSkills(embeddedDir, "embedded")) {
      byId.set(s.id, s);
    }
  }

  if (fileExists(paths.skills)) {
    for (const s of await scanSkills(paths.skills, "user")) {
      byId.set(s.id, s);
    }
  }

  for (const wsRoot of workspaceDirsInPriority(cwd)) {
    const wsSkills = join(wsRoot, "skills");
    if (fileExists(wsSkills)) {
      for (const s of await scanSkills(wsSkills, "workspace")) {
        byId.set(s.id, s);
      }
    }
  }

  const list = Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id));
  return { byId, list };
}

export async function findSkill(id: string, cwd?: string): Promise<Skill | undefined> {
  const { byId } = await loadSkills(cwd);
  return byId.get(id);
}

async function scanSkills(root: string, source: Skill["source"]): Promise<Skill[]> {
  const out: Skill[] = [];
  await walk(root, root, 0, source, out);
  return out;
}

async function walk(root: string, dir: string, depth: number, source: Skill["source"], out: Skill[]): Promise<void> {
  const entries = await readdir(dir);

  // Squad convention: a directory at depth >= 1 containing ONLY `SKILL.md`
  // (no sibling .md files at the same depth) represents a single named skill.
  // Distinguish that from the testdino/pwagent "pack index" convention where
  // SKILL.md sits next to many siblings — in the latter case SKILL.md is an
  // index that we skip. The root (depth 0) is never treated as a Squad skill.
  const hasSkillManifest = entries.includes("SKILL.md");
  const otherMdFiles = entries.filter((e) => e !== "SKILL.md" && e.endsWith(".md"));
  if (depth > 0 && hasSkillManifest && otherMdFiles.length === 0) {
    out.push(await loadSquadSkill(root, dir, join(dir, "SKILL.md"), source));
    // still recurse into sub-directories — Squad shape may nest more skills under a parent
    for (const entry of entries) {
      const full = join(dir, entry);
      const s = await stat(full);
      if (s.isDirectory()) await walk(root, full, depth + 1, source, out);
    }
    return;
  }

  for (const entry of entries) {
    const full = join(dir, entry);
    const s = await stat(full);
    if (s.isDirectory()) {
      await walk(root, full, depth + 1, source, out);
      continue;
    }
    if (!s.isFile() || !entry.endsWith(".md")) continue;
    if (entry === "SKILL.md") continue; // pack index — siblings carry the real skills
    const rel = relative(root, full).replace(/\\/g, "/");
    const parts = rel.split("/");
    const file = parts[parts.length - 1]!;
    const name = file.replace(/\.md$/, "");
    if (name === "README") continue;
    const pack = parts.length > 1 ? parts[0]! : "root";
    const id = parts.length > 1 ? `${pack}/${name}` : name;

    const raw = await readText(full);
    const parsed = matter(raw);
    const fm = parsed.data ?? {};
    const description = typeof fm["description"] === "string" ? (fm["description"] as string) : firstParagraph(parsed.content);

    out.push({
      id,
      pack,
      name,
      description,
      source,
      path: full,
      body: parsed.content,
      frontmatter: fm,
    });
  }
}

/**
 * Load a Squad-shaped skill directory: <root>/.../<name>/SKILL.md.
 *
 * Pack derivation:
 *   - If there's an intermediate path segment (e.g. `playwright-cli/auth/SKILL.md`),
 *     the first segment is the pack.
 *   - If the skill dir is at root depth (e.g. `kusto/SKILL.md`), the skill's
 *     own directory name becomes its pack. So `kusto/SKILL.md` → pack="kusto",
 *     name="kusto", id="kusto". This matches the user mental model where
 *     `kusto/` IS the kusto skill — there's no separate "workspace" pack.
 */
async function loadSquadSkill(root: string, dir: string, manifest: string, source: Skill["source"]): Promise<Skill> {
  const relDir = relative(root, dir).replace(/\\/g, "/");
  const parts = relDir.split("/").filter(Boolean);
  const name = parts[parts.length - 1] ?? "skill";
  const pack = parts.length > 1 ? parts[0]! : name;
  const id = parts.length > 1 ? `${pack}/${name}` : name;

  const raw = await readText(manifest);
  const parsed = matter(raw);
  const fm = parsed.data ?? {};
  const description = typeof fm["description"] === "string" ? (fm["description"] as string) : firstParagraph(parsed.content);

  return {
    id,
    pack,
    name,
    description,
    source,
    path: manifest,
    body: parsed.content,
    frontmatter: fm,
  };
}

function firstParagraph(body: string): string {
  const trimmed = body.trim();
  const para = trimmed.split(/\n\s*\n/, 1)[0] ?? "";
  return para.replace(/\s+/g, " ").slice(0, 160);
}
