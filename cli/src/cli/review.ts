import { Command } from "commander";
import { existsSync } from "node:fs";
import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { c, HR } from "../utils/colors.js";
import { ensureDir } from "../utils/files.js";
import { paths } from "../utils/paths.js";
import { selectOne, text } from "../utils/prompts.js";
import { writeAuditEvent } from "../audit/writer.js";

const QUEUE_PATH = join(paths.state, "review-queue.jsonl");
const STAMPS_PATH = join(paths.state, "review-stamps.jsonl");

interface QueueItem {
  id: string;
  agent: string;
  enqueuedAt: string;
  summary: string;
  verdict?: "ProductBug" | "TestCodeBug" | "Environment" | "Inconclusive";
  confidence?: number;
}

export const reviewCommand = new Command("review")
  .description("HITL gate — pending triage verdicts. Operator stamps [p]roduct / [t]est / [s]kip / [o]pen-trace.")
  .option("--non-interactive", "list pending items but do not prompt")
  .action(async (opts: { nonInteractive?: boolean }) => {
    await ensureDir(paths.state);
    const queue = await loadQueue();
    if (queue.length === 0) {
      console.log(c.dim("no pending review items — queue is empty"));
      return;
    }
    console.log(HR);
    console.log(c.bold(`  pending review items: ${queue.length}`));
    console.log(HR);

    if (opts.nonInteractive) {
      for (const it of queue) {
        console.log(`  ${c.cyan(it.id)} ${c.dim(it.enqueuedAt)} agent=${it.agent}`);
        console.log(`    verdict: ${it.verdict ?? "—"}  confidence: ${it.confidence ?? "—"}`);
        console.log(`    summary: ${it.summary}`);
      }
      return;
    }

    for (const it of queue) {
      console.log();
      console.log(c.bold(`  ${it.id}`));
      console.log(`    agent:      ${it.agent}`);
      console.log(`    verdict:    ${it.verdict ?? "—"}  (confidence ${it.confidence ?? "—"})`);
      console.log(`    summary:    ${it.summary}`);

      const stamp = await selectOne<"p" | "t" | "s" | "o" | "skip">(
        "stamp",
        [
          { title: "[p] Product bug — fix in src/", value: "p" },
          { title: "[t] Test code bug — fix in tests/", value: "t" },
          { title: "[s] Skip / inconclusive — file env bug, no auto-fix", value: "s" },
          { title: "[o] Open trace + come back later", value: "o" },
          { title: "(skip this one)", value: "skip" },
        ],
      );
      if (!stamp || stamp === "skip" || stamp === "o") {
        console.log(c.dim("  → left in queue"));
        continue;
      }
      const comment = await text("comment (optional)");
      const stampedAt = new Date().toISOString();
      const record = {
        id: it.id,
        agent: it.agent,
        stamp,
        comment: comment ?? "",
        stampedAt,
        operator: process.env["USER"] ?? process.env["USERNAME"] ?? "unknown",
      };
      await appendFile(STAMPS_PATH, JSON.stringify(record) + "\n", "utf8");
      await writeAuditEvent({
        type: "review.stamp",
        timestamp: stampedAt,
        agent: it.agent,
        runId: it.id,
        data: { stamp, operator: record.operator },
      });
      console.log(c.ok(`  ✓ stamped [${stamp}]`));
    }
  });

async function loadQueue(): Promise<QueueItem[]> {
  if (!existsSync(QUEUE_PATH)) return [];
  const raw = await readFile(QUEUE_PATH, "utf8");
  const out: QueueItem[] = [];
  // also load stamped IDs so we can filter them out
  const stamped = new Set<string>();
  if (existsSync(STAMPS_PATH)) {
    const sraw = await readFile(STAMPS_PATH, "utf8");
    for (const l of sraw.split("\n").filter(Boolean)) {
      try {
        const r = JSON.parse(l) as { id: string };
        stamped.add(r.id);
      } catch {
        /* skip */
      }
    }
  }
  for (const l of raw.split("\n").filter(Boolean)) {
    try {
      const it = JSON.parse(l) as QueueItem;
      if (!stamped.has(it.id)) out.push(it);
    } catch {
      /* skip */
    }
  }
  return out;
}
