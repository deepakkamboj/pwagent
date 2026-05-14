/**
 * The `dispatch_to_agent` tool — only injected into chat sessions so the
 * supervisor's autonomous routing works without going through the CLI.
 *
 * When the supervisor's model decides to delegate, it calls this tool. The
 * handler invokes the named specialist via `coordinator.invoke()` and returns
 * the specialist's full text output. The supervisor then either streams that
 * back verbatim (its charter instructs it to) or adds a thin wrapper.
 *
 * Kept out of the global tool registry on purpose — `pwagent run <agent>`
 * (the CI path) should not see this tool, only interactive chat.
 */

import { invoke } from "./coordinator.js";
import type { Tool, ToolContext } from "./tools/index.js";

export interface DispatchToolOptions {
  /** Working directory passed to every sub-agent invoke. */
  cwd: string;
  /**
   * Optional progress callback that fires as each sub-agent runs.
   * Lets the chat REPL render a "● dispatch_to_agent  <name>" header
   * even before the SDK's tool.execution_start event arrives.
   */
  onDispatch?: (agent: string, prompt: string, mode?: string) => void;
  /**
   * Optional event sink so the chat REPL can stream sub-agent output
   * through its own renderer instead of dumping at the end.
   */
  onSubDelta?: (chunk: string) => void;
}

export function makeDispatchTool(opts: DispatchToolOptions): Tool {
  return {
    name: "dispatch_to_agent",
    description:
      "Run a pwagent specialist for a sub-task and return their full text output. Use this when the user's request maps to a named specialist agent (triage, fix, analyze, validate, author, etc.). Don't editorialize on the result — return it verbatim unless the user asks for a summary.",
    inputSchema: {
      type: "object",
      properties: {
        agent: {
          type: "string",
          description:
            "Specialist agent name. Available: discover, triage, analyze, plan, fix, validate, author, auth, publish, record, report, review.",
        },
        prompt: {
          type: "string",
          description:
            "The prompt or flag-string to send to the specialist. Examples: '--orchestrate --ado-pipeline 23878' for fix; '--run-id 12345' for triage.",
        },
        mode: {
          type: "string",
          enum: ["direct", "light", "standard", "full"],
          description: "Response mode hint. Defaults to standard.",
        },
      },
      required: ["agent", "prompt"],
    },
    async run(rawArgs: unknown, _ctx: ToolContext): Promise<unknown> {
      const args = (rawArgs ?? {}) as { agent?: string; prompt?: string; mode?: "direct" | "light" | "standard" | "full" };
      const agent = args.agent?.trim();
      const prompt = args.prompt?.trim();
      const mode = args.mode ?? "standard";

      if (!agent) return { ok: false, error: "agent name is required" };
      if (!prompt) return { ok: false, error: "prompt is required" };
      if (agent === "supervisor") {
        return {
          ok: false,
          error:
            "refusing to dispatch to supervisor from a chat session — that would loop. Pick a specialist instead.",
        };
      }

      opts.onDispatch?.(agent, prompt, mode);

      try {
        const result = await invoke({
          agent,
          prompt,
          mode,
          cwd: opts.cwd,
          events: opts.onSubDelta
            ? {
                onDelta: opts.onSubDelta,
              }
            : undefined,
        });
        return {
          ok: true,
          agent,
          mode,
          durationMs: result.durationMs,
          toolCalls: result.toolCalls?.length ?? 0,
          output: result.output ?? "",
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, error: msg };
      }
    },
  };
}
