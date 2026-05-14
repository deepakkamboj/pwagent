import { Command } from "commander";
import { writeFileSync } from "node:fs";
import { c, HR } from "../utils/colors.js";
import { loadConfig } from "../config/loader.js";
import { readAuditEvents, type AuditEvent } from "../audit/writer.js";

export const auditCommand = new Command("audit").description("Inspect / export the audit event stream");

auditCommand
  .command("export")
  .description("Export events with optional filters. Defaults to JSONL on stdout.")
  .option("--since <duration>", "e.g. 7d, 24h, 30m — drops events older than this", "30d")
  .option("--type <type>", "filter by event type (run.start, run.complete, tool.invoke, …)")
  .option("--agent <name>", "filter by agent name")
  .option("--format <fmt>", "jsonl | json | table", "jsonl")
  .option("-o, --output <path>", "write to file instead of stdout")
  .action(async (opts: { since: string; type?: string; agent?: string; format: string; output?: string }) => {
    const cfg = await loadConfig();
    if (!cfg.audit.enabled) {
      console.warn(c.warn("audit is disabled in config — nothing to export"));
      return;
    }
    const events = readAuditEvents(cfg.audit.path, 10_000);
    const cutoffMs = parseDuration(opts.since);
    const cutoff = Date.now() - cutoffMs;
    const filtered = events.filter((e) => {
      const t = e.timestamp ? new Date(e.timestamp).getTime() : 0;
      if (t < cutoff) return false;
      if (opts.type && e.type !== opts.type) return false;
      if (opts.agent && e.agent !== opts.agent) return false;
      return true;
    });

    const out = render(filtered, opts.format);
    if (opts.output) {
      writeFileSync(opts.output, out, "utf8");
      console.log(c.ok(`✓ wrote ${filtered.length} events to ${opts.output}`));
    } else {
      process.stdout.write(out);
    }
  });

auditCommand
  .command("tail")
  .description("Print the last N events")
  .option("-n, --limit <n>", "events to show", "20")
  .action(async (opts: { limit: string }) => {
    const cfg = await loadConfig();
    const limit = Math.max(1, Math.min(1000, parseInt(opts.limit, 10) || 20));
    const events = readAuditEvents(cfg.audit.path, limit);
    if (events.length === 0) {
      console.log(c.dim("audit log is empty"));
      return;
    }
    console.log(HR);
    for (const e of events) {
      console.log(`${c.dim(e.timestamp)} ${c.bold(e.type)} ${e.agent ? c.cyan(e.agent) : ""} ${e.runId ? c.dim(e.runId) : ""}`);
      if (e.data && Object.keys(e.data).length > 0) {
        console.log(c.dim("  " + JSON.stringify(e.data).slice(0, 200)));
      }
    }
    console.log(HR);
    console.log(c.dim(`${events.length} event(s)`));
  });

function parseDuration(s: string): number {
  const m = /^(\d+)([dhm])$/i.exec(s);
  if (!m) return 30 * 86_400_000; // default 30d
  const n = parseInt(m[1]!, 10);
  const unit = m[2]!.toLowerCase();
  if (unit === "d") return n * 86_400_000;
  if (unit === "h") return n * 3_600_000;
  return n * 60_000;
}

function render(events: AuditEvent[], format: string): string {
  if (format === "json") return JSON.stringify(events, null, 2) + "\n";
  if (format === "table") {
    const lines = ["TIMESTAMP\tTYPE\tAGENT\tRUN_ID"];
    for (const e of events) lines.push([e.timestamp, e.type, e.agent ?? "", e.runId ?? ""].join("\t"));
    return lines.join("\n") + "\n";
  }
  // default jsonl
  return events.map((e) => JSON.stringify(e)).join("\n") + (events.length ? "\n" : "");
}
