import { findCharter, type Charter } from "../charters/loader.js";
import { loadSkills, type Skill } from "../skills/loader.js";
import { loadConfig } from "../config/loader.js";
import type { Config } from "../config/schema.js";
import { runProviderSession, type ProviderSessionEvents } from "./provider.js";
import { ALL_TOOLS, getTools, type Tool } from "./tools/index.js";

export interface CoordinatorInvocation {
  agent: string;
  prompt: string;
  /** Override model from CLI; falls back to charter > config > default. */
  modelOverride?: string;
  /** Response mode hint. */
  mode?: "direct" | "light" | "standard" | "full";
  /** Working directory the tools resolve relative paths against. Defaults to process.cwd(). */
  cwd?: string;
  /** Optional dry-run: build the system prompt + tool list but don't call the model. */
  dryRun?: boolean;
  events?: ProviderSessionEvents;
}

export interface CoordinatorResult {
  agent: string;
  charterSource: Charter["source"];
  systemPrompt: string;
  model: string;
  toolNames: string[];
  skillsInjected: { id: string; reason: string }[];
  dryRun: boolean;
  output?: string;
  toolCalls?: { name: string; ok: boolean }[];
  durationMs?: number;
}

/**
 * The Coordinator is the entry point for any agent invocation. It:
 *   1. Loads the named charter (workspace override > user > embedded)
 *   2. Selects model: charter > config.perAgent > config.default > override
 *   3. Picks the tool allowlist from the charter (parsed from `## Tools` block)
 *      with fallback to the config default allowlist
 *   4. Performs skill-aware injection — scans skills/*.md and appends a
 *      short pointer block to the system prompt for the highest-scoring matches
 *   5. Calls the Copilot SDK via runProviderSession (unless dryRun)
 */
export async function invoke(req: CoordinatorInvocation): Promise<CoordinatorResult> {
  const cwd = req.cwd ?? process.cwd();
  const charter = await findCharter(req.agent, cwd);
  if (!charter) {
    throw new Error(`unknown agent: ${req.agent} — run 'pwagent agents list' to see available`);
  }

  const cfg = await loadConfig();
  const model = pickModel(req.agent, cfg, charter, req.modelOverride);

  const allowedToolNames = pickToolAllowlist(charter, cfg);
  const tools: Tool[] = getTools(new Set(allowedToolNames));

  const allSkills = await loadSkills(cwd);
  const injected = pickSkills(req.prompt, charter, allSkills.list);

  const systemPrompt = buildSystemPrompt(charter, injected, req.mode ?? "standard");

  if (req.dryRun) {
    return {
      agent: req.agent,
      charterSource: charter.source,
      systemPrompt,
      model,
      toolNames: tools.map((t) => t.name),
      skillsInjected: injected.map((s) => ({ id: s.id, reason: "matched user prompt + charter keywords" })),
      dryRun: true,
    };
  }

  const result = await runProviderSession({
    systemPrompt,
    prompt: req.prompt,
    model,
    clientName: cfg.provider.clientName,
    tools,
    toolContext: {
      cwd,
      allowlist: new Set(allowedToolNames),
    },
    events: req.events,
  });

  return {
    agent: req.agent,
    charterSource: charter.source,
    systemPrompt,
    model,
    toolNames: tools.map((t) => t.name),
    skillsInjected: injected.map((s) => ({ id: s.id, reason: "matched user prompt + charter keywords" })),
    dryRun: false,
    output: result.fullText,
    toolCalls: result.toolCalls,
    durationMs: result.durationMs,
  };
}

function pickModel(agent: string, cfg: Config, charter: Charter, override: string | undefined): string {
  if (override) return override;
  const per = cfg.provider.perAgent?.[agent]?.model;
  if (per) return per;
  // charter's `## Model` block — Brady's Squad convention. Look for "Preferred: <id>"
  const charterModel = extractCharterModel(charter.body);
  if (charterModel) return charterModel;
  return cfg.provider.model;
}

function extractCharterModel(body: string): string | undefined {
  const headingIdx = body.search(/##\s+Model/i);
  if (headingIdx === -1) return undefined;
  const tail = body.slice(headingIdx, headingIdx + 400);
  const m = tail.match(/Preferred:\s*([\w.\-/]+)/i);
  if (m && m[1] && m[1].toLowerCase() !== "auto") return m[1];
  return undefined;
}

function pickToolAllowlist(charter: Charter, cfg: Config): string[] {
  const fromCharter = extractCharterTools(charter.body);
  if (fromCharter.length > 0) return fromCharter;
  // fall back to config-level allowlist, intersected with the tools we actually ship
  const shipped = new Set(ALL_TOOLS.map((t) => t.name));
  return cfg.tools.allowlist.filter((t) => shipped.has(t));
}

function extractCharterTools(body: string): string[] {
  const idx = body.search(/##\s+Tools/i);
  if (idx === -1) return [];
  // Take the next ~600 chars and look for tool names we know about.
  const segment = body.slice(idx, idx + 600).toLowerCase();
  const known = ALL_TOOLS.map((t) => t.name);
  return known.filter((t) => segment.includes(t));
}

function pickSkills(userPrompt: string, charter: Charter, skills: Skill[]): Skill[] {
  // Very simple keyword scorer: count overlap between user prompt + charter
  // description and the skill description. Take top 3.
  const haystack = `${userPrompt}\n${charter.description}`.toLowerCase();
  const scored = skills
    .map((s) => ({ s, score: scoreOverlap(haystack, `${s.id} ${s.description}`.toLowerCase()) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  return scored.map((x) => x.s);
}

function scoreOverlap(haystack: string, candidate: string): number {
  const tokens = candidate
    .split(/[\s/.\-]+/)
    .filter((t) => t.length >= 4)
    .slice(0, 30);
  let score = 0;
  for (const t of tokens) if (haystack.includes(t)) score += 1;
  return score;
}

function buildSystemPrompt(charter: Charter, skills: Skill[], mode: string): string {
  const skillBlock =
    skills.length > 0
      ? `\n\n## Relevant skill references (read these in full before starting)\n${skills
          .map((s) => `- [${s.id}] ${s.description}`)
          .join("\n")}`
      : "";
  const modeBlock = `\n\n## Response Mode\nYou are operating in **${mode}** mode. Be terse and tool-driven; let the structured output and lifecycle events carry the meaning.`;
  return `${charter.body.trim()}${skillBlock}${modeBlock}`;
}
