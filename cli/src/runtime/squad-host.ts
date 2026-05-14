/**
 * Squad host — pwagent's entry into GitHub Copilot CLI.
 *
 * Why: Copilot CLI provides the chat UX we want — banner, slash-command
 * autocomplete, persistent session, native streaming, multi-line input.
 * Squad (@bradygaster/squad-cli) orchestrates multi-agent workflows on top
 * of it. We don't build a custom chat REPL: we delegate.
 *
 * Directory strategy:
 *   - `.pwagent/`  is the **canonical, user-facing** content directory.
 *                  User edits here. Charters, skills, routing, ceremonies.
 *   - `.squad/`    is **auto-generated** (mirrored from .pwagent/ on every
 *                  launch). Squad CLI hardcodes `.squad/` as its scan path,
 *                  so we keep that working for compatibility. Add `.squad/`
 *                  to .gitignore — it's regenerated.
 *
 * Flow:
 *   1. `pwagent` (no args, TTY) → ensure .pwagent/ exists (scaffold from
 *      embedded content if missing) → mirror .pwagent/ → .squad/ → spawn
 *      `npx @bradygaster/squad-cli`.
 *   2. Squad reads .squad/, hands off to Copilot CLI with our 13 agents
 *      pre-loaded.
 *
 * `pwagent run <agent>` remains as the CI / unattended path. It uses
 * pwagent's own coordinator + SDK adapter — no Copilot CLI dependency on
 * CI runners.
 */

import { spawn } from "node:child_process";
import { cp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { c } from "../utils/colors.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Path to the embedded content baked into the binary at build time. */
function embeddedContentDir(): string {
  // dist/runtime/squad-host.js → dist/content/
  return resolve(__dirname, "..", "content");
}

/**
 * Ensure the cwd has a `.pwagent/` directory populated with our 13 agents,
 * 60+ skills, routing.md, team.md, ceremonies.md, master-prompt.md.
 * Creates only what's missing — never overwrites user customisations.
 *
 * Then mirrors `.pwagent/` → `.squad/` (overwriting `.squad/` so Squad CLI
 * always sees the latest user edits in `.pwagent/`).
 */
async function ensureScaffolding(cwd: string): Promise<void> {
  const embedded = embeddedContentDir();
  if (!existsSync(embedded)) {
    throw new Error(
      `embedded content not found at ${embedded} — was the binary built? (run npm run build:cli)`,
    );
  }

  // ── .pwagent/ — canonical, scaffold only if missing ─────────────────────
  const pwagentDir = join(cwd, ".pwagent");
  if (!existsSync(pwagentDir)) {
    await mkdir(pwagentDir, { recursive: true });
    await cp(join(embedded, "agents"), join(pwagentDir, "agents"), { recursive: true });
    await cp(join(embedded, "skills"), join(pwagentDir, "skills"), { recursive: true });
    for (const file of ["routing.md", "team.md", "ceremonies.md", "master-prompt.md"]) {
      try {
        const content = await readFile(join(embedded, file), "utf8");
        await writeFile(join(pwagentDir, file), content, "utf8");
      } catch {
        /* skip missing source file */
      }
    }
    console.log(c.dim(`  scaffolded .pwagent/ at ${pwagentDir}`));
  } else {
    // Top-level pwagent dir exists. Top up any individual files that are
    // missing (e.g. user wiped routing.md or never had master-prompt.md).
    if (!existsSync(join(pwagentDir, "agents"))) {
      await cp(join(embedded, "agents"), join(pwagentDir, "agents"), { recursive: true });
    }
    if (!existsSync(join(pwagentDir, "skills"))) {
      await cp(join(embedded, "skills"), join(pwagentDir, "skills"), { recursive: true });
    }
    for (const file of ["routing.md", "team.md", "ceremonies.md", "master-prompt.md"]) {
      if (existsSync(join(pwagentDir, file))) continue;
      try {
        const content = await readFile(join(embedded, file), "utf8");
        await writeFile(join(pwagentDir, file), content, "utf8");
      } catch {
        /* skip */
      }
    }
  }

  // ── .squad/ — generated mirror (Squad CLI hardcodes this name) ──────────
  // We rebuild it fresh every launch so user edits in .pwagent/ propagate.
  const squadDir = join(cwd, ".squad");
  if (existsSync(squadDir)) {
    await rm(squadDir, { recursive: true, force: true });
  }
  await cp(pwagentDir, squadDir, { recursive: true });
}

/**
 * Spawn `npx @bradygaster/squad-cli` in the current cwd with stdio inherited
 * so the user sees Copilot CLI's full TUI. Returns the child's exit code.
 *
 * Squad will discover .squad/ (mirrored from our .pwagent/) and load our 13
 * agents + skills + routing rules into the Copilot session.
 */
export async function startSquadShell(cwd: string): Promise<number> {
  await ensureScaffolding(cwd);

  console.log(c.dim("  launching GitHub Copilot CLI via Squad…"));
  console.log();

  return await new Promise<number>((resolvePromise) => {
    const isWin = process.platform === "win32";
    const npxBin = isWin ? "npx.cmd" : "npx";

    const child = spawn(npxBin, ["@bradygaster/squad-cli"], {
      cwd,
      stdio: "inherit",
      env: {
        ...process.env,
        SQUAD_HOST: "pwagent",
      },
      shell: false,
    });

    child.on("exit", (code) => resolvePromise(code ?? 0));
    child.on("error", (err) => {
      console.error(c.err(`  squad-cli failed to launch: ${err.message}`));
      console.error(
        c.dim("  → ensure @bradygaster/squad-cli is installed (npm i -g @bradygaster/squad-cli)"),
      );
      resolvePromise(1);
    });
  });
}
