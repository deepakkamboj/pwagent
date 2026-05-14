import { execa } from "execa";
import type { Tool } from "./types.js";

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_BYTES = 200_000;

/**
 * Allowlist of binaries the agent may invoke. Charters specifying agent.tools must
 * still gate this via ToolContext.allowlist, but we additionally hard-cap the binary
 * name here as defence-in-depth.
 */
const ALLOWED_BINARIES = new Set([
  "git",
  "gh",
  "az",
  "npx",
  "npm",
  "node",
  "pwsh",
  "powershell",
  "bash",
  "sh",
  "kusto.cli",
  "axe",
]);

export const bashTool: Tool = {
  name: "bash",
  description:
    "Run a command from an allowlisted binary. Captures stdout+stderr. No shell expansion — argv is passed verbatim. Max 120s, 200 KB output.",
  inputSchema: {
    type: "object",
    properties: {
      cmd: { type: "string", description: "Binary name (must be on the allowlist)" },
      args: { type: "array", items: { type: "string" }, description: "Argv (no shell expansion)" },
      cwd: { type: "string", description: "Optional cwd override" },
      timeoutMs: { type: "number", description: "Timeout in ms (max 600000)" },
    },
    required: ["cmd"],
    additionalProperties: false,
  },
  async run(args, ctx) {
    const a =
      (args as { cmd?: string; args?: string[]; cwd?: string; timeoutMs?: number }) ?? {};
    if (!a.cmd) throw new Error("bash: 'cmd' is required");
    if (!ALLOWED_BINARIES.has(a.cmd)) {
      throw new Error(`bash: '${a.cmd}' is not on the allowlist (${[...ALLOWED_BINARIES].join(", ")})`);
    }
    const timeout = Math.min(a.timeoutMs ?? DEFAULT_TIMEOUT_MS, 600_000);
    const cwd = a.cwd ?? ctx.cwd;

    const res = await execa(a.cmd, a.args ?? [], {
      timeout,
      reject: false,
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const stdout = truncate(res.stdout ?? "", MAX_OUTPUT_BYTES);
    const stderr = truncate(res.stderr ?? "", MAX_OUTPUT_BYTES);
    return {
      cmd: a.cmd,
      args: a.args ?? [],
      cwd,
      exitCode: res.exitCode ?? -1,
      timedOut: res.timedOut === true,
      stdout,
      stderr,
    };
  },
};

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n…[truncated; original length ${s.length}]`;
}
