import { Command } from "commander";
import { execa } from "execa";
import { c, glyph, HR } from "../utils/colors.js";

/**
 * `pwagent login` — wrap `gh auth login` so users don't need to remember
 * the right invocation. The Copilot SDK reads from gh's keychain.
 *
 * `pwagent logout` — wrap `gh auth logout`.
 *
 * `pwagent whoami` — show who's logged in and whether Copilot is active.
 */

export const loginCommand = new Command("login")
  .description("Authenticate with GitHub (required for Copilot SDK)")
  .option("--web", "use web flow (default)", true)
  .option("--device", "use device-code flow instead")
  .option("--scopes <list>", "comma-separated extra OAuth scopes", "read:user")
  .action(async (opts: { web?: boolean; device?: boolean; scopes?: string }) => {
    console.log(HR);
    console.log(c.bold("  pwagent login"));
    console.log(HR);
    console.log(c.dim("  Delegating to `gh auth login`. A Copilot subscription is required for agent runs."));
    console.log();
    const args = ["auth", "login", "--scopes", opts.scopes ?? "read:user"];
    if (opts.device) {
      // Don't pass --web; gh will prompt for device-code flow.
    } else {
      args.push("--web");
    }
    try {
      await execa("gh", args, { stdio: "inherit", timeout: 600_000 });
      console.log();
      console.log(c.ok("  ✓ login complete — run `pwagent doctor` to verify Copilot is reachable"));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(c.err(`  login failed: ${msg.split("\n")[0]}`));
      console.error(c.dim("  Is gh installed? Run: pwagent prereqs --install gh"));
      process.exitCode = 1;
    }
  });

export const logoutCommand = new Command("logout")
  .description("Sign out of GitHub (revokes Copilot access)")
  .action(async () => {
    try {
      await execa("gh", ["auth", "logout"], { stdio: "inherit" });
      console.log(c.ok("  ✓ logged out"));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(c.err(`  logout failed: ${msg.split("\n")[0]}`));
      process.exitCode = 1;
    }
  });

export const whoamiCommand = new Command("whoami")
  .description("Show GitHub login + Copilot status")
  .action(async () => {
    const auth = await execa("gh", ["auth", "status"], { reject: false, timeout: 10_000 });
    console.log(HR);
    if (auth.exitCode === 0) {
      // gh prints to stderr; pass through
      console.log((auth.stderr || auth.stdout).trim());
      console.log();
      console.log(`  ${glyph.ok} authenticated`);
    } else {
      console.log(c.warn("  not logged in — run `pwagent login`"));
      process.exitCode = 1;
      return;
    }
    // Check the Copilot extension is installed (proxy for "Copilot subscription is reachable")
    const ext = await execa("gh", ["extension", "list"], { reject: false, timeout: 10_000 });
    const copilotInstalled =
      ext.exitCode === 0 && ext.stdout.split("\n").some((l) => l.includes("github/gh-copilot"));
    if (copilotInstalled) {
      console.log(`  ${glyph.ok} gh copilot extension installed`);
    } else {
      console.log(`  ${glyph.err} gh copilot extension missing — run \`pwagent prereqs --install gh-copilot\``);
    }
    console.log(HR);
  });
