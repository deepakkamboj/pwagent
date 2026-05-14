import { execa } from "execa";
import type { Tool } from "./types.js";

/**
 * Wraps ripgrep when available, falling back to grep. Returns matching lines
 * with file:line prefixes. Capped output.
 */
export const grepTool: Tool = {
  name: "grep",
  description: "Search the workspace for a regex. Returns matching lines with file:line prefixes. Capped at 500 matches.",
  inputSchema: {
    type: "object",
    properties: {
      pattern: { type: "string" },
      path: { type: "string", description: "Optional directory to search in (defaults to cwd)." },
      ignoreCase: { type: "boolean" },
      glob: { type: "string", description: "Optional --glob pattern (rg only)" },
    },
    required: ["pattern"],
    additionalProperties: false,
  },
  async run(args, ctx) {
    const a = (args as { pattern?: string; path?: string; ignoreCase?: boolean; glob?: string }) ?? {};
    if (!a.pattern) throw new Error("grep: 'pattern' is required");
    const target = a.path ?? ctx.cwd;
    const tryRg = await execa("rg", ["--version"], { reject: false, timeout: 5_000 });
    if (tryRg.exitCode === 0) {
      const rgArgs = ["--line-number", "--max-count=500"];
      if (a.ignoreCase) rgArgs.push("-i");
      if (a.glob) rgArgs.push("--glob", a.glob);
      rgArgs.push(a.pattern, target);
      const r = await execa("rg", rgArgs, { reject: false, timeout: 30_000 });
      return { source: "ripgrep", exitCode: r.exitCode ?? -1, matches: (r.stdout ?? "").split("\n").filter(Boolean) };
    }
    // grep fallback
    const grepArgs = ["-rn"];
    if (a.ignoreCase) grepArgs.push("-i");
    grepArgs.push(a.pattern, target);
    const r = await execa("grep", grepArgs, { reject: false, timeout: 30_000 });
    return { source: "grep", exitCode: r.exitCode ?? -1, matches: (r.stdout ?? "").split("\n").filter(Boolean).slice(0, 500) };
  },
};
