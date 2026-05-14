/**
 * Copilot-CLI-style render primitives for the chat REPL.
 *
 * Conventions (reverse-engineered from GitHub Copilot CLI + ConnectBuddy screenshots):
 *   ● <text>          pink/magenta dot, then bright text — agent action / narration / tool header
 *   ✔ <text>          checkmark in green + bold — phase completion summary
 *   ✗ <text>          cross in red — failure
 *      <text>         3-space indent + dim — tool result detail
 *      - <text>       6-space indent + "- " + dim — bulleted output (file lists, urls)
 *      <text>         3-space indent + plain — trailing narrative paragraph
 *   <cwd>  [<branch>] dim line above the prompt — env context
 *   ›                 U+203A right-angle quote — prompt symbol
 *   v<ver> · ...      bottom status bar (dim) — printed after each turn
 */

import pc from "picocolors";
import { stdout } from "node:process";

const PINK = (s: string): string => pc.magenta(s);
const BRIGHT = (s: string): string => pc.white(s);

const PROMPT_GLYPH = "›"; // ›
const DOT = "●"; // ●
const CHECK = "✔"; // ✔
const CROSS = "✗"; // ✗

export const PROMPT = `${pc.cyan(PROMPT_GLYPH)} `;

/** ● <text> — agent narration or tool header */
export function dot(text: string): string {
  return `${PINK(DOT)} ${BRIGHT(text)}`;
}

/** ✔ <text> — phase completion */
export function done(text: string): string {
  return `${pc.green(CHECK)} ${pc.bold(text)}`;
}

/** ✗ <text> — failure summary */
export function fail(text: string): string {
  return `${pc.red(CROSS)} ${pc.bold(text)}`;
}

/** 3-space indent + dim — tool result body */
export function subline(text: string): string {
  return `   ${pc.dim(text)}`;
}

/** 6-space indent + "- " — bulleted file/url list */
export function deepBullet(text: string): string {
  return `      ${pc.dim("- " + text)}`;
}

/** 3-space indent, plain — trailing narrative paragraph */
export function narrate(text: string): string {
  return `   ${text}`;
}

/** dim line: "<cwd>  [<branch>]" — env context above prompt */
export function envLine(cwd: string, branch?: string): string {
  const branchPart = branch ? `  [${branch}]` : "";
  return pc.dim(`${cwd}${branchPart}`);
}

/** dim status bar — printed below the prompt after each turn */
export function statusBar(opts: { version: string; model: string; agent?: string }): string {
  const left = `v${opts.version}  ·  / commands  ·  ? help`;
  const right = opts.agent ? `${opts.agent}  ·  ${opts.model}` : opts.model;
  const cols = stdout.columns ?? 80;
  const padLen = Math.max(2, cols - left.length - right.length);
  return pc.dim(`${left}${" ".repeat(padLen)}${right}`);
}

/** Write a renderer line straight to stdout. */
export function write(line: string): void {
  stdout.write(line + "\n");
}

/** Spacer line. */
export function blank(): void {
  stdout.write("\n");
}

/**
 * Soft-wrap an assistant text delta into pink-dotted paragraphs.
 * Paragraphs are separated by blank lines. First chunk of each paragraph
 * gets the dot prefix; subsequent wrapped lines get a 2-space indent so
 * the leading text aligns with the prefix.
 */
export function renderAssistantParagraph(text: string): void {
  const paras = text.split(/\n\n+/);
  for (let i = 0; i < paras.length; i++) {
    const para = paras[i]?.trim();
    if (!para) continue;
    if (i > 0) blank();
    write(dot(para));
  }
}

/**
 * Format a tool call as a Copilot-CLI-style header + result block.
 * The exact shape depends on which tool — `read`, `write`, `edit`, `bash`,
 * `grep`, and `dispatch_to_agent` each get tailored rendering.
 */
export interface ToolRenderInput {
  tool: string;
  args?: Record<string, unknown>;
  /** Set when the tool has completed; absent during the start event. */
  result?: {
    ok: boolean;
    /** Human summary: "23 lines read", "+12 -4 lines", "exit 0 (1.4s)", etc. */
    summary?: string;
    /** Optional multi-line output for bash; we render first N lines as sublines. */
    detail?: string[];
  };
}

export function renderTool(input: ToolRenderInput): void {
  const { tool, args, result } = input;

  // Header — same for start and complete events; idempotent
  const header = formatToolHeader(tool, args);
  write(dot(header));

  if (!result) return;

  // Detail lines
  if (result.summary) write(subline(result.summary));
  if (result.detail) {
    for (const d of result.detail.slice(0, 5)) write(subline(d));
    if (result.detail.length > 5) write(subline(`... ${result.detail.length - 5} more lines`));
  }
  if (!result.ok) write(subline(pc.red("✗ failed")));
}

function formatToolHeader(tool: string, args?: Record<string, unknown>): string {
  if (!args) return tool;
  switch (tool) {
    case "read":
      return `Read ${String(args["path"] ?? "")}`;
    case "write":
      return `Write ${String(args["path"] ?? "")}`;
    case "edit":
      return `Edit ${String(args["path"] ?? "")}`;
    case "bash": {
      const cmd = String(args["command"] ?? "");
      const truncated = cmd.length > 80 ? cmd.slice(0, 77) + "..." : cmd;
      return `Bash $ ${truncated}`;
    }
    case "grep":
      return `Grep ${String(args["pattern"] ?? "")}${args["path"] ? ` in ${args["path"]}` : ""}`;
    case "dispatch_to_agent":
      return `dispatch_to_agent  ${pc.cyan(String(args["agent"] ?? ""))}`;
    default:
      return tool;
  }
}

/** Render the bottom status bar at the end of a turn. */
export function renderTurnFooter(opts: {
  version: string;
  model: string;
  agent?: string;
  cwd: string;
  branch?: string;
}): void {
  blank();
  write(envLine(opts.cwd, opts.branch));
  blank();
  stdout.write(PROMPT); // no newline — prompt waits for input
  // Status bar would persist below prompt in a true TUI; in raw mode we let
  // the prompt sit alone and the user types directly.
}

/** Render a one-line status summary used by /doctor and the startup probe. */
export function statusOneLine(ok: boolean, parts: string[]): string {
  const glyph = ok ? pc.green(CHECK) : pc.red(CROSS);
  return `${glyph} ${parts.join(pc.dim(" · "))}`;
}
