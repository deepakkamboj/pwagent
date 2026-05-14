import { Command } from "commander";
import { c, HR, glyph } from "../utils/colors.js";
import { invoke } from "../runtime/coordinator.js";
import { writeAuditEvent } from "../audit/writer.js";

export const runCommand = new Command("run")
  .description("Invoke an agent by name. The coordinator routes via charter + skill-aware spawn through the Copilot SDK.")
  .argument("<agent>", "agent name (see: pwagent agents list)")
  .argument("[prompt...]", "free-form prompt; if omitted, charter receives the raw flags as input")
  .option("--model <id>", "override the model for this run (charter '## Model' still wins if unset)")
  .option("--mode <mode>", "response mode: direct | light | standard | full", "standard")
  .option("--cwd <path>", "working directory for tool calls", process.cwd())
  .option("--dry-run", "show the assembled system prompt + tool list; do not call the model")
  .option("--json", "emit machine-readable result to stdout instead of streaming")
  .option("--debug", "raise SDK log level to debug; print init progress to stderr")
  .option("--connect-timeout-s <n>", "SDK connect timeout in seconds (default 20)", (v) => parseInt(v, 10), 20)
  .option("--idle-timeout-s <n>", "session idle timeout in seconds (default 600)", (v) => parseInt(v, 10), 600)
  .allowUnknownOption()
  .action(
    async (
      agent: string,
      promptParts: string[],
      opts: {
        model?: string;
        mode?: "direct" | "light" | "standard" | "full";
        cwd?: string;
        dryRun?: boolean;
        json?: boolean;
        debug?: boolean;
        connectTimeoutS?: number;
        idleTimeoutS?: number;
      },
    ) => {
      const prompt = promptParts.join(" ").trim() || `Run agent ${agent}`;
      const runId = `run_${Date.now()}`;
      await writeAuditEvent({
        type: "run.start",
        timestamp: new Date().toISOString(),
        agent,
        runId,
        data: { prompt, model: opts.model, mode: opts.mode },
      });

      if (!opts.json && !opts.dryRun) {
        console.log(HR);
        console.log(`  ${c.bold("pwagent run")} ${c.dim("→")} ${c.cyan(agent)}   ${c.dim(`(model: ${opts.model ?? "auto"} · mode: ${opts.mode ?? "standard"})`)}`);
        console.log(HR);
      }

      try {
        const result = await invoke({
          agent,
          prompt,
          modelOverride: opts.model,
          mode: opts.mode,
          cwd: opts.cwd,
          dryRun: opts.dryRun,
          debug: opts.debug,
          connectTimeoutMs: (opts.connectTimeoutS ?? 20) * 1000,
          idleTimeoutMs: (opts.idleTimeoutS ?? 600) * 1000,
          onProgress: opts.json
            ? undefined
            : (stage) => process.stderr.write(c.dim(`  ${glyph.pending} ${stage}…\n`)),
          events: opts.json
            ? undefined
            : {
                onDelta: (chunk) => process.stdout.write(chunk),
                onToolStart: (name) => process.stderr.write(c.dim(`\n  ${glyph.pending} ${name}\n`)),
                onToolEnd: (name, ok) => process.stderr.write(c.dim(`  ${ok ? glyph.ok : glyph.err} ${name}\n`)),
              },
        });

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else if (opts.dryRun) {
          console.log(c.bold("system prompt:"));
          console.log(c.dim(result.systemPrompt));
          console.log();
          console.log(c.bold(`model: `) + result.model);
          console.log(c.bold(`tools: `) + result.toolNames.join(", "));
          console.log(c.bold(`skills injected: `) + (result.skillsInjected.map((s) => s.id).join(", ") || "(none)"));
        } else {
          console.log();
          console.log(HR);
          console.log(c.ok(`  ✓ done (${result.durationMs} ms, ${result.toolCalls?.length ?? 0} tool calls)`));
        }

        await writeAuditEvent({
          type: "run.complete",
          timestamp: new Date().toISOString(),
          agent,
          runId,
          data: { durationMs: result.durationMs, toolCalls: result.toolCalls?.length ?? 0 },
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        await writeAuditEvent({
          type: "run.error",
          timestamp: new Date().toISOString(),
          agent,
          runId,
          data: { error: msg },
        });
        // The provider adapter already attaches an actionable hint via "\n  → ..." when it can
        // identify the failure mode (missing scope, no Copilot CLI, network reachability).
        // For anything else, point the user at the global health check.
        console.error(c.err(`error: ${msg}`));
        if (msg.includes("@github/copilot-sdk")) {
          console.error(c.dim("  → did you 'npm install' and 'pwagent login'? See `pwagent doctor`."));
        } else if (!msg.includes("→")) {
          console.error(c.dim("  → run `pwagent doctor` to verify auth + prereqs"));
        }
        process.exitCode = 1;
      }
    },
  );
