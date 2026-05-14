import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { embeddedContentDir, paths, workspaceDir } from "../utils/paths.js";
import { fileExists } from "../utils/files.js";

export interface RoutingRow {
  workType: string;
  agent: string;
  examples: string[];
}

export interface ReviewerGate {
  artifact: string;
  reviewer: string;
  gate: string;
}

export interface RoutingTable {
  rows: RoutingRow[];
  gates: ReviewerGate[];
  source: "embedded" | "workspace" | "user";
  path: string;
}

/**
 * Load and parse routing.md from the most specific override available.
 * Same precedence chain as charters: workspace > user > embedded.
 *
 * The parser is intentionally simple — it walks the markdown looking for two
 * tables under `## Work routing` and `## Reviewer gates`. Anything else is ignored.
 */
export async function loadRoutingTable(cwd: string = process.cwd()): Promise<RoutingTable> {
  const candidates = [
    { p: join(workspaceDir(cwd), "routing.md"), source: "workspace" as const },
    { p: join(paths.home, "routing.md"), source: "user" as const },
    { p: join(embeddedContentDir(), "routing.md"), source: "embedded" as const },
  ];
  for (const { p, source } of candidates) {
    if (fileExists(p)) {
      const raw = await readFile(p, "utf8");
      return { ...parseRouting(raw), source, path: p };
    }
  }
  // No file found — shouldn't happen since embedded ships, but be defensive.
  return { rows: [], gates: [], source: "embedded", path: "" };
}

export function pickAgentForPrompt(prompt: string, table: RoutingTable): string | undefined {
  const lower = prompt.toLowerCase();
  // Score each row by example-keyword and work-type-keyword overlap.
  let best: { agent: string; score: number } | undefined;
  for (const r of table.rows) {
    let score = 0;
    for (const ex of r.examples) {
      if (lower.includes(ex.toLowerCase())) score += 3;
    }
    for (const t of r.workType.toLowerCase().split(/[\s,/]+/).filter((x) => x.length >= 4)) {
      if (lower.includes(t)) score += 1;
    }
    if (!best || score > best.score) best = { agent: r.agent, score };
  }
  if (!best || best.score === 0) return undefined;
  return best.agent;
}

export function gateForArtifact(artifact: string, table: RoutingTable): ReviewerGate | undefined {
  return table.gates.find((g) => g.artifact.toLowerCase().includes(artifact.toLowerCase()));
}

function parseRouting(raw: string): { rows: RoutingRow[]; gates: ReviewerGate[] } {
  const rows: RoutingRow[] = [];
  const gates: ReviewerGate[] = [];

  const workSection = sliceSection(raw, /##\s+Work routing/i);
  if (workSection) {
    for (const cells of parseTable(workSection)) {
      if (cells.length < 3) continue;
      const examples = cells[2]!
        .split(/"\s*,\s*"|,\s*/)
        .map((e) => e.replace(/^"|"$/g, "").trim())
        .filter(Boolean);
      rows.push({ workType: cells[0]!, agent: cells[1]!, examples });
    }
  }

  const gateSection = sliceSection(raw, /##\s+Reviewer gates/i);
  if (gateSection) {
    for (const cells of parseTable(gateSection)) {
      if (cells.length < 3) continue;
      gates.push({ artifact: cells[0]!, reviewer: cells[1]!, gate: cells[2]! });
    }
  }

  return { rows, gates };
}

function sliceSection(raw: string, headingPattern: RegExp): string | undefined {
  const idx = raw.search(headingPattern);
  if (idx === -1) return undefined;
  const after = raw.slice(idx);
  const nextHeading = after.slice(2).search(/\n##\s+/);
  return nextHeading === -1 ? after : after.slice(0, nextHeading + 2);
}

function parseTable(section: string): string[][] {
  const out: string[][] = [];
  const lines = section.split("\n");
  let header = false;
  for (const line of lines) {
    if (!line.startsWith("|")) {
      header = false;
      continue;
    }
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    if (!header) {
      // first row is the header; second is the separator
      header = true;
      continue;
    }
    if (cells.every((c) => /^-+$/.test(c.replace(/:/g, "")))) continue; // separator
    out.push(cells);
  }
  return out;
}
