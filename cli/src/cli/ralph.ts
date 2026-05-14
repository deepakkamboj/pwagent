import { Command } from "commander";
import { c, HR } from "../utils/colors.js";
import { invoke } from "../runtime/coordinator.js";
import { writeAuditEvent } from "../audit/writer.js";

/**
 * Ralph — the in-session driver. Squad's Ralph keeps the coordinator looping over
 * the work queue inside an active Copilot CLI session. Our equivalent: spawn the
 * supervisor charter repeatedly until the queue is empty or the user hits Ctrl+C.
 *
 * Queue source: ~/.pwagent/state/review-queue.jsonl + any open ADO bugs (loaded
 * by the supervisor itself when it runs — we don't pre-fetch here).
 */
export const ralphCommand = new Command("ralph").description("In-session driver — keeps the supervisor looping over pending work");

ralphCommand
  .command("go")
  .description("Activate the loop. Press Ctrl+C to stop.")
  .option("--interval <seconds>", "seconds to wait between cycles", "5")
  .option("--max-iterations <n>", "stop after this many cycles", "100")
  .action(async (opts: { interval: string; maxIterations: string }) => {
    const intervalSec = Math.max(1, parseInt(opts.interval, 10) || 5);
    const max = Math.max(1, parseInt(opts.maxIterations, 10) || 100);
    console.log(HR);
    console.log(c.bold("  ralph — going. Ctrl+C to stop."));
    console.log(c.dim(`  interval: ${intervalSec}s · max iterations: ${max}`));
    console.log(HR);

    let stopped = false;
    process.on("SIGINT", () => {
      stopped = true;
      console.log();
      console.log(c.dim("  → stopping after current cycle"));
    });

    for (let i = 1; i <= max; i++) {
      if (stopped) break;
      console.log();
      console.log(c.bold(`  cycle ${i}/${max}`));
      try {
        await invoke({
          agent: "supervisor",
          prompt: "Scan the work queue. Pick the next pending task and dispatch. If the queue is empty, say so plainly and exit cycle.",
          mode: "light",
          events: { onDelta: (chunk) => process.stdout.write(chunk) },
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(c.err(`cycle ${i} failed: ${msg.split("\n")[0]}`));
      }
      if (!stopped) await new Promise((r) => setTimeout(r, intervalSec * 1000));
    }
    console.log();
    console.log(c.ok("  ralph idle."));
  });

ralphCommand
  .command("status")
  .description("Single cycle — scan and report, do not loop")
  .action(async () => {
    try {
      await invoke({
        agent: "supervisor",
        prompt: "Status report only: how many pending items, which agents are active, any auto-disabled jobs. No dispatch.",
        mode: "direct",
        events: { onDelta: (chunk) => process.stdout.write(chunk) },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(c.err(msg));
      process.exitCode = 1;
    }
  });

ralphCommand
  .command("stop")
  .description("Deactivate the loop (no-op if already idle)")
  .action(async () => {
    await writeAuditEvent({ type: "scheduler.stop", timestamp: new Date().toISOString(), data: { source: "ralph" } });
    console.log(c.ok("✓ ralph deactivated (next cycle will exit)"));
  });
