import { readdir, stat } from "node:fs/promises";
import { join, basename } from "node:path";
import matter from "gray-matter";
import { embeddedContentDir, paths, workspaceDirsInPriority } from "../utils/paths.js";
import { fileExists, readText } from "../utils/files.js";

export interface Charter {
  name: string;
  description: string;
  source: "embedded" | "workspace" | "user";
  path: string;
  body: string;
  frontmatter: Record<string, unknown>;
}

interface ChartersIndex {
  byName: Map<string, Charter>;
  list: Charter[];
}

/**
 * Resolution order (later overrides earlier):
 *   1. embedded:  <dist>/content/agents/<name>/charter.md OR <dist>/content/agents/<name>.agent.md
 *   2. user:      ~/.pwagent/agents/<name>.md
 *   3. workspace: <cwd>/.squad/agents/<name>/charter.md
 */
export async function loadCharters(cwd: string = process.cwd()): Promise<ChartersIndex> {
  const byName = new Map<string, Charter>();

  const embeddedDir = join(embeddedContentDir(), "agents");
  if (fileExists(embeddedDir)) {
    for (const c of await scanCharters(embeddedDir, "embedded")) {
      byName.set(c.name, c);
    }
  }

  if (fileExists(paths.agents)) {
    for (const c of await scanCharters(paths.agents, "user")) {
      byName.set(c.name, c);
    }
  }

  // Iterate workspace dirs in priority order: .squad first, then .pwagent overrides
  // it. Same Map.set pattern: later entries win.
  for (const wsRoot of workspaceDirsInPriority(cwd)) {
    const wsAgents = join(wsRoot, "agents");
    if (fileExists(wsAgents)) {
      for (const c of await scanCharters(wsAgents, "workspace")) {
        byName.set(c.name, c);
      }
    }
  }

  const list = Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
  return { byName, list };
}

export async function findCharter(name: string, cwd?: string): Promise<Charter | undefined> {
  const { byName } = await loadCharters(cwd);
  return byName.get(name);
}

async function scanCharters(dir: string, source: Charter["source"]): Promise<Charter[]> {
  const entries = await readdir(dir);
  const out: Charter[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const s = await stat(fullPath);
    if (s.isDirectory()) {
      const charterFile = join(fullPath, "charter.md");
      if (fileExists(charterFile)) {
        out.push(await loadOne(entry, charterFile, source));
      }
      continue;
    }
    if (s.isFile() && (entry.endsWith(".agent.md") || entry.endsWith(".md"))) {
      const name = basename(entry).replace(/\.agent\.md$/, "").replace(/\.md$/, "");
      // skip non-charter files like routing.md, ceremonies.md, team.md in the same tree
      if (["routing", "ceremonies", "team", "decisions", "README"].includes(name)) continue;
      out.push(await loadOne(name, fullPath, source));
    }
  }
  return out;
}

async function loadOne(name: string, path: string, source: Charter["source"]): Promise<Charter> {
  const raw = await readText(path);
  const parsed = matter(raw);
  const fm = parsed.data ?? {};
  const fmName = typeof fm["name"] === "string" ? (fm["name"] as string) : name;
  const description = typeof fm["description"] === "string" ? (fm["description"] as string) : "";
  return {
    name: stripPrefix(fmName),
    description,
    source,
    path,
    body: parsed.content,
    frontmatter: fm,
  };
}

function stripPrefix(name: string): string {
  return name.replace(/^pwagent-/, "");
}
