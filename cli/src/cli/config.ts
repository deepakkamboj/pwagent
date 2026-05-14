import { Command } from "commander";
import { c, HR } from "../utils/colors.js";
import { configExists, getConfigValue, loadConfig, setConfigValue } from "../config/loader.js";
import { paths } from "../utils/paths.js";

export const configCommand = new Command("config").description("View / get / set config values");

configCommand
  .command("view")
  .description("Pretty-print the full config")
  .action(async () => {
    if (!(await configExists())) {
      console.log(c.warn("no config — run pwagent init"));
      process.exitCode = 1;
      return;
    }
    const cfg = await loadConfig();
    console.log(HR);
    console.log(c.dim(`  ${paths.config}`));
    console.log(HR);
    console.log(JSON.stringify(cfg, null, 2));
  });

configCommand
  .command("get <path>")
  .description("Read a value at a dotted path (e.g. provider.model)")
  .action(async (path: string) => {
    if (!(await configExists())) {
      console.log(c.warn("no config — run pwagent init"));
      process.exitCode = 1;
      return;
    }
    const v = await getConfigValue(path);
    if (v === undefined) {
      console.error(c.err(`not set: ${path}`));
      process.exitCode = 1;
      return;
    }
    console.log(typeof v === "string" ? v : JSON.stringify(v, null, 2));
  });

configCommand
  .command("set <path> <value>")
  .description("Write a value at a dotted path. Value is parsed as JSON if it looks like JSON, else string.")
  .action(async (path: string, value: string) => {
    if (!(await configExists())) {
      console.log(c.warn("no config — run pwagent init"));
      process.exitCode = 1;
      return;
    }
    let parsed: unknown = value;
    try {
      parsed = JSON.parse(value);
    } catch {
      // keep as string
    }
    try {
      await setConfigValue(path, parsed);
      console.log(c.ok(`✓ set ${path}`));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(c.err(msg));
      process.exitCode = 1;
    }
  });

configCommand
  .command("path")
  .description("Print the config file path")
  .action(() => {
    console.log(paths.config);
  });
