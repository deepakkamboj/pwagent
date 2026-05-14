import { Command } from "commander";
import { c, HR } from "../utils/colors.js";
import { ask, confirm, selectOne, text } from "../utils/prompts.js";
import { configExists, saveConfig } from "../config/loader.js";
import { ConfigSchema, DEFAULT_CONFIG, type Config } from "../config/schema.js";
import { paths } from "../utils/paths.js";
import { ensureDir } from "../utils/files.js";
import { showBanner, shouldShowBanner } from "../utils/banner.js";

const MODEL_CHOICES = [
  { title: "Claude Sonnet 4.5 (default — balanced)", value: "claude-sonnet-4.5" },
  { title: "Claude Opus 4.5 (heavier — for harder fixes)", value: "claude-opus-4.5" },
  { title: "Claude Haiku 4.5 (cheap — for loggers / matchers)", value: "claude-haiku-4.5" },
  { title: "GPT-5 (alternative)", value: "gpt-5" },
];

export const initCommand = new Command("init")
  .description("Interactive: provider, ADO, default repo, state directory")
  .option("--yes", "accept defaults non-interactively")
  .action(async (opts: { yes?: boolean }) => {
    if (shouldShowBanner()) showBanner();
    console.log(HR);
    console.log(c.bold("  pwagent init"));
    console.log(HR);
    console.log(c.dim("  pwagent runs on GitHub Copilot via @github/copilot-sdk."));
    console.log(c.dim("  Auth: `gh auth login` with a Copilot-enabled GitHub account."));
    console.log();

    if (await configExists()) {
      if (!opts.yes) {
        const overwrite = await confirm(
          `Config already exists at ${paths.config} — overwrite?`,
          false,
        );
        if (!overwrite) {
          console.log(c.dim("  cancelled"));
          return;
        }
      }
    }

    const draft: Config = structuredClone(DEFAULT_CONFIG);

    if (opts.yes) {
      console.log(c.dim("  --yes: applying defaults"));
    } else {
      const model = await selectOne<string>("Default model", MODEL_CHOICES);
      if (!model) {
        console.log(c.dim("  cancelled"));
        return;
      }
      draft.provider.model = model;

      const clientName = await text("Client name (sent to Copilot for telemetry)", draft.provider.clientName);
      if (clientName === undefined) return;
      draft.provider.clientName = clientName;

      const adoAns = await ask<{ org: string; project: string; defaultRepo: string }>([
        { type: "text", name: "org", message: "Azure DevOps org URL (optional)", initial: "" },
        { type: "text", name: "project", message: "ADO project (optional)", initial: "" },
        { type: "text", name: "defaultRepo", message: "Default repo name (optional)", initial: "" },
      ]);
      if (!("cancelled" in adoAns)) {
        if (adoAns.org) draft.ado.org = adoAns.org;
        if (adoAns.project) draft.ado.project = adoAns.project;
        if (adoAns.defaultRepo) draft.ado.defaultRepo = adoAns.defaultRepo;
      }
    }

    // re-validate before write
    const validated = ConfigSchema.parse(draft);
    await ensureDir(paths.home);
    await ensureDir(paths.agents);
    await ensureDir(paths.skills);
    await ensureDir(paths.scheduler);
    await ensureDir(paths.logs);
    await ensureDir(paths.audit);
    await ensureDir(paths.reports);
    await ensureDir(paths.state);
    await saveConfig(validated);

    console.log();
    console.log(c.ok("  ✓ wrote ") + paths.config);
    console.log(c.dim("  next steps:"));
    console.log(c.dim("    1. gh auth login            (if you haven't already)"));
    console.log(c.dim("    2. gh extension install github/gh-copilot   (if not present)"));
    console.log(c.dim("    3. pwagent doctor           (verify)"));
  });
