#!/usr/bin/env node
import { Command } from "commander";
import { c } from "./utils/colors.js";
import { initCommand } from "./cli/init.js";
import { doctorCommand } from "./cli/doctor.js";
import { prereqsCommand } from "./cli/prereqs.js";
import { agentsCommand } from "./cli/agents.js";
import { skillsCommand } from "./cli/skills.js";
import { configCommand } from "./cli/config.js";
import { loginCommand, logoutCommand, whoamiCommand } from "./cli/auth.js";
import { modelCommand } from "./cli/model.js";
import { runCommand } from "./cli/run.js";
import { jobCommand, schedulerCommand } from "./cli/scheduler.js";
import { startSquadShell } from "./runtime/squad-host.js";
import { ralphCommand } from "./cli/ralph.js";
import { portalCommand } from "./cli/portal.js";
import { reviewCommand } from "./cli/review.js";
import { auditCommand } from "./cli/audit.js";
import { serviceCommand } from "./cli/service.js";
import { bannerCommand } from "./cli/banner.js";
import { showBanner, shouldShowBanner } from "./utils/banner.js";
import packageJson from "../package.json" with { type: "json" };

const program = new Command();

program
  .name("pwagent")
  .description("Standalone CLI for multi-agent Playwright testing — Squad design, self-contained runtime")
  .version((packageJson as { version: string }).version);

// Bootstrap + auth
program.addCommand(initCommand);
program.addCommand(loginCommand);
program.addCommand(logoutCommand);
program.addCommand(whoamiCommand);
program.addCommand(doctorCommand);
program.addCommand(prereqsCommand);

// Inspection
program.addCommand(agentsCommand);
program.addCommand(skillsCommand);
program.addCommand(modelCommand);
program.addCommand(configCommand);

// Runtime — `pwagent run` is the CI / scripted path; `pwagent` (no args) opens
// chat via Squad → Copilot CLI (see bottom of this file).
program.addCommand(runCommand);

// Scheduler
program.addCommand(schedulerCommand);
program.addCommand(jobCommand);
program.addCommand(serviceCommand);

// Drivers / surfaces
program.addCommand(ralphCommand);
program.addCommand(portalCommand);
program.addCommand(reviewCommand);

// Observability
program.addCommand(auditCommand);

// Cosmetic
program.addCommand(bannerCommand);

// Running `pwagent` with no subcommand:
//   - TTY stdin → spawn `@bradygaster/squad-cli`, which launches GitHub Copilot
//                 CLI with our 13 agents loaded from .squad/. We get the full
//                 native Copilot CLI chat UX (banner, slash commands,
//                 autocomplete, status bar) — no custom REPL to maintain.
//   - non-TTY  → print help and exit 0, so scripts that pipe to pwagent don't
//                 accidentally try to launch a TUI.
if (process.argv.length <= 2) {
  if (process.stdin.isTTY) {
    if (shouldShowBanner()) showBanner();
    startSquadShell(process.cwd())
      .then((code) => process.exit(code))
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(c.err(`error: ${msg}`));
        process.exit(1);
      });
  } else {
    if (shouldShowBanner()) showBanner();
    program.outputHelp();
    process.exit(0);
  }
} else {
  program.parseAsync(process.argv).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(c.err(`error: ${msg}`));
    process.exit(1);
  });
}
