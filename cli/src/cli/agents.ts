import { Command } from "commander";
import { c, HR } from "../utils/colors.js";
import { findCharter, loadCharters } from "../charters/loader.js";
import { copyFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { ensureDir, fileExists } from "../utils/files.js";
import { paths } from "../utils/paths.js";

export const agentsCommand = new Command("agents").description("List / show / add charters");

agentsCommand
  .command("list")
  .description("List all charters (embedded + workspace + user)")
  .action(async () => {
    const { list } = await loadCharters();
    if (list.length === 0) {
      console.log(c.warn("no charters found"));
      return;
    }
    console.log(HR);
    console.log(`  ${c.bold("NAME".padEnd(22))} ${c.bold("SOURCE".padEnd(12))} ${c.bold("DESCRIPTION")}`);
    console.log(HR);
    for (const ch of list) {
      const src = ch.source === "embedded" ? c.dim("embedded") : ch.source === "workspace" ? c.cyan("workspace") : c.magenta("user");
      const desc = ch.description.length > 60 ? ch.description.slice(0, 57) + "..." : ch.description;
      console.log(`  ${ch.name.padEnd(22)} ${src.padEnd(20)} ${c.dim(desc)}`);
    }
    console.log(HR);
    console.log(c.dim(`${list.length} charter${list.length === 1 ? "" : "s"}`));
  });

agentsCommand
  .command("show <name>")
  .description("Print the full charter for the given agent")
  .action(async (name: string) => {
    const ch = await findCharter(name);
    if (!ch) {
      console.error(c.err(`charter not found: ${name}`));
      console.error(c.dim("run: pwagent agents list"));
      process.exitCode = 1;
      return;
    }
    console.log(HR);
    console.log(`  ${c.bold(ch.name)}     ${c.dim(`source: ${ch.source}`)}`);
    console.log(`  ${c.dim(ch.path)}`);
    console.log(HR);
    if (ch.description) {
      console.log(c.dim(ch.description));
      console.log();
    }
    console.log(ch.body.trim());
  });

agentsCommand
  .command("add <path>")
  .description("Copy a charter file into ~/.pwagent/agents/ (user override)")
  .action(async (path: string) => {
    if (!fileExists(path)) {
      console.error(c.err(`not found: ${path}`));
      process.exitCode = 1;
      return;
    }
    await ensureDir(paths.agents);
    const name = basename(path).replace(/\.agent\.md$/, "").replace(/\.md$/, "");
    const dst = join(paths.agents, `${name}.md`);
    await copyFile(path, dst);
    console.log(c.ok("✓ added ") + dst);
  });
