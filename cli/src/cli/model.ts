import { Command } from "commander";
import { c, glyph, HR } from "../utils/colors.js";
import { configExists, loadConfig, setConfigValue } from "../config/loader.js";

/**
 * Models reachable via the GitHub Copilot SDK. This list is hand-curated rather
 * than fetched live — the SDK does not expose a list endpoint, and the set of
 * models accessible to a given Copilot subscription changes infrequently.
 * Users with custom enterprise gateways can override via `pwagent config set provider.model <any-id>`.
 */
const KNOWN_MODELS = [
  { id: "claude-sonnet-4.5", label: "Claude Sonnet 4.5", default: true, note: "balanced — recommended default" },
  { id: "claude-opus-4.5", label: "Claude Opus 4.5", note: "heavier reasoning — use for hard fixes / triage" },
  { id: "claude-haiku-4.5", label: "Claude Haiku 4.5", note: "cheap + fast — use for loggers, matchers, learner" },
  { id: "claude-sonnet-4.6", label: "Claude Sonnet 4.6", note: "newer Sonnet point release" },
  { id: "gpt-5", label: "GPT-5", note: "alternative provider routed via Copilot" },
  { id: "gpt-5-mini", label: "GPT-5 mini", note: "cheaper GPT-5 variant" },
  { id: "o3-mini", label: "OpenAI o3 mini", note: "reasoning model" },
];

export const modelCommand = new Command("model").description("Manage the default model and per-agent overrides");

modelCommand
  .command("list")
  .description("Show known Copilot-routed models")
  .action(async () => {
    console.log(HR);
    console.log(c.bold("  Available models (via GitHub Copilot SDK)"));
    console.log(HR);
    let active: string | undefined;
    if (await configExists()) {
      const cfg = await loadConfig();
      active = cfg.provider.model;
    }
    for (const m of KNOWN_MODELS) {
      const marker = m.id === active ? c.ok("●") : c.dim("○");
      const def = m.default ? c.dim(" (default)") : "";
      console.log(`  ${marker} ${c.bold(m.id.padEnd(22))} ${c.dim(m.note)}${def}`);
    }
    if (active && !KNOWN_MODELS.some((m) => m.id === active)) {
      console.log(`  ${c.ok("●")} ${c.bold(active.padEnd(22))} ${c.dim("(custom — not in known list)")}`);
    }
    console.log(HR);
    console.log(c.dim("  set default:    pwagent model set <id>"));
    console.log(c.dim("  per-agent:      pwagent model set <id> --agent <agent>"));
    console.log(c.dim("  show current:   pwagent model show"));
    console.log(c.dim("  custom model:   pwagent config set provider.model <any-id>"));
  });

modelCommand
  .command("show")
  .description("Show the current default model and any per-agent overrides")
  .action(async () => {
    if (!(await configExists())) {
      console.log(c.warn("  no config — run `pwagent init`"));
      process.exitCode = 1;
      return;
    }
    const cfg = await loadConfig();
    console.log(HR);
    console.log(`  default model:   ${c.bold(cfg.provider.model)}`);
    if (cfg.provider.perAgent && Object.keys(cfg.provider.perAgent).length > 0) {
      console.log();
      console.log(c.bold("  per-agent overrides:"));
      for (const [agent, ov] of Object.entries(cfg.provider.perAgent)) {
        if (ov?.model) console.log(`    ${agent.padEnd(20)} ${ov.model}`);
      }
    } else {
      console.log(c.dim("  no per-agent overrides set"));
    }
    console.log(HR);
  });

modelCommand
  .command("set <id>")
  .description("Set the default model, or a per-agent override with --agent")
  .option("--agent <agent>", "set this model for one agent only (charter ## Model block still wins)")
  .action(async (id: string, opts: { agent?: string }) => {
    if (!(await configExists())) {
      console.log(c.warn("  no config — run `pwagent init`"));
      process.exitCode = 1;
      return;
    }
    if (!KNOWN_MODELS.some((m) => m.id === id)) {
      console.log(c.warn(`  ${glyph.pending} '${id}' is not in the known model list — assuming custom override`));
    }
    if (opts.agent) {
      const path = `provider.perAgent.${opts.agent}`;
      try {
        await setConfigValue(`${path}.model`, id);
        console.log(c.ok(`  ✓ ${opts.agent} → ${id}`));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(c.err(`  ${msg}`));
        process.exitCode = 1;
      }
    } else {
      try {
        await setConfigValue("provider.model", id);
        console.log(c.ok(`  ✓ default model → ${id}`));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(c.err(`  ${msg}`));
        process.exitCode = 1;
      }
    }
  });

modelCommand
  .command("reset")
  .description("Drop all per-agent model overrides (default model unchanged)")
  .action(async () => {
    if (!(await configExists())) {
      console.log(c.warn("  no config — run `pwagent init`"));
      process.exitCode = 1;
      return;
    }
    try {
      await setConfigValue("provider.perAgent", {});
      console.log(c.ok("  ✓ cleared all per-agent overrides"));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(c.err(`  ${msg}`));
      process.exitCode = 1;
    }
  });
