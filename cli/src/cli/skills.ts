import { Command } from "commander";
import { c, HR } from "../utils/colors.js";
import { findSkill, loadSkills } from "../skills/loader.js";

export const skillsCommand = new Command("skills").description("List / show skill guides");

skillsCommand
  .command("list")
  .description("List all skills (embedded + workspace + user)")
  .option("--pack <pack>", "filter by pack (core, ci, pom, playwright-cli)")
  .action(async (opts: { pack?: string }) => {
    const { list } = await loadSkills();
    const filtered = opts.pack ? list.filter((s) => s.pack === opts.pack) : list;
    if (filtered.length === 0) {
      console.log(c.warn("no skills found"));
      return;
    }
    console.log(HR);
    console.log(`  ${c.bold("ID".padEnd(40))} ${c.bold("PACK".padEnd(16))} ${c.bold("SOURCE")}`);
    console.log(HR);
    const grouped: Record<string, typeof filtered> = {};
    for (const s of filtered) {
      const k = s.pack;
      grouped[k] = grouped[k] ?? [];
      grouped[k]!.push(s);
    }
    for (const pack of Object.keys(grouped).sort()) {
      for (const s of grouped[pack]!) {
        const src = s.source === "embedded" ? c.dim("embedded") : s.source === "workspace" ? c.cyan("workspace") : c.magenta("user");
        console.log(`  ${s.id.padEnd(40)} ${s.pack.padEnd(16)} ${src}`);
      }
    }
    console.log(HR);
    console.log(c.dim(`${filtered.length} skill${filtered.length === 1 ? "" : "s"}`));
  });

skillsCommand
  .command("show <id>")
  .description("Print the full skill guide. Use pack/name form, e.g. core/locators")
  .action(async (id: string) => {
    const s = await findSkill(id);
    if (!s) {
      console.error(c.err(`skill not found: ${id}`));
      console.error(c.dim("run: pwagent skills list"));
      process.exitCode = 1;
      return;
    }
    console.log(HR);
    console.log(`  ${c.bold(s.id)}     ${c.dim(`source: ${s.source}`)}`);
    console.log(`  ${c.dim(s.path)}`);
    console.log(HR);
    if (s.description) {
      console.log(c.dim(s.description));
      console.log();
    }
    console.log(s.body.trim());
  });
