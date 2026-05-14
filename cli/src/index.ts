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
import { chatCommand } from "./cli/chat.js";
import { jobCommand, schedulerCommand } from "./cli/scheduler.js";
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

// Runtime
program.addCommand(runCommand);
program.addCommand(chatCommand);

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

// Running `pwagent` with no subcommand should print help and exit 0 — not an
// error condition. commander's default behaviour is exit 1 here, which makes
// `npm start` look like a failure when nothing is actually wrong.
if (process.argv.length <= 2) {
  if (shouldShowBanner()) showBanner();
  program.outputHelp();
  process.exit(0);
}

program.parseAsync(process.argv).catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(c.err(`error: ${msg}`));
  process.exit(1);
});
