/**
 * Squad host — pwagent's entry into the Squad chat shell.
 *
 * Why: Squad (@bradygaster/squad-cli) provides the chat UX we want — banner,
 * slash-command autocomplete, persistent session, native streaming, multi-line
 * input. We don't build a custom chat REPL: we delegate.
 *
 * Directory strategy:
 *   - `.pwagent/`  is the **canonical, user-facing** content directory.
 *                  User edits here. Charters, skills, routing, ceremonies.
 *   - `.squad/`    is **auto-generated** (mirrored from .pwagent/ on every
 *                  launch). Squad CLI hardcodes `.squad/` as its scan path,
 *                  so we keep that working for compatibility. Add `.squad/`
 *                  to .gitignore — it's regenerated.
 *
 * Branding: Squad reads `squad.brand.json` in the cwd and respects
 * `SQUAD_BRAND_*` env vars. No runtime patching of compiled files needed.
 *
 * Flow:
 *   1. `pwagent` (no args, TTY) → ensure .pwagent/ exists (scaffold from
 *      embedded content if missing) → mirror .pwagent/ → .squad/ → spawn
 *      squad-cli with SQUAD_BRAND_* env vars.
 *   2. Squad reads .squad/, loads our 16 agents pre-loaded.
 *
 * `pwagent run <agent>` remains as the CI / unattended path. It uses
 * pwagent's own coordinator + SDK adapter — no Squad dependency on CI runners.
 */

import { spawn } from "node:child_process";
import { cp, mkdir, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { c } from "../utils/colors.js";

const _require = createRequire(import.meta.url);
function getPwagentVersion(): string {
  try {
    // Resolve own package.json to get the correct version even from dist/
    const pkg = _require("../../package.json") as { version?: string };
    return pkg.version ?? "0.1.0";
  } catch {
    return "0.1.0";
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Walk up from __dirname to find squad-cli's cli-entry.js.
 * Avoids require.resolve() which is blocked by squad-cli's `exports` field
 * (it doesn't expose the ./package.json subpath).
 */
function findSquadCliEntry(): string | undefined {
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, "node_modules", "@bradygaster", "squad-cli", "dist", "cli-entry.js");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/** Locate squad-cli's install root by finding its cli-entry.js first. */
function findSquadCliRoot(): string | undefined {
  const entry = findSquadCliEntry();
  if (!entry) return undefined;
  // entry: .../squad-cli/dist/cli-entry.js → root is two levels up
  return dirname(dirname(entry));
}

/**
 * Ensure `.github/agents/squad.agent.md` exists. Squad CLI requires this file
 * as the coordinator agent that orchestrates the others. We seed it from the
 * shipped template, but rename `name: Squad` → `name: pwagent` so the agent
 * identifies as pwagent in responses (e.g. response prefixes).
 */
async function ensureCoordinatorManifest(cwd: string): Promise<void> {
  const root = findSquadCliRoot();
  if (!root) return;
  const template = join(root, "templates", "squad.agent.md.template");
  if (!existsSync(template)) return;

  const ghAgentsDir = join(cwd, ".github", "agents");
  const dst = join(ghAgentsDir, "squad.agent.md");
  if (existsSync(dst)) return; // never overwrite a user's customised manifest

  await mkdir(ghAgentsDir, { recursive: true });
  let body = await readFile(template, "utf8");
  // Rebrand the coordinator's *identity* (frontmatter `name:` and the
  // "Squad (Coordinator)" identifier). Leave references to the upstream
  // Squad framework intact — those are accurate ("Squad's design", etc.).
  body = body.replace(/^name: Squad$/m, "name: pwagent");
  body = body.replace(/Squad \(Coordinator\)/g, "pwagent (Coordinator)");
  await writeFile(dst, body, "utf8");
}

/** Path to the embedded content baked into the binary at build time. */
function embeddedContentDir(): string {
  // dist/runtime/squad-host.js → dist/content/
  return resolve(__dirname, "..", "content");
}

/**
 * Ensure the cwd has a `.pwagent/` directory populated with all embedded
 * agents, skills, routing.md, team.md, ceremonies.md, master-prompt.md.
 *
 * Strategy:
 *   - New agents in embedded content are **added** to .pwagent/agents/ on
 *     every launch (additive sync). Existing agent dirs are never overwritten
 *     so user customisations survive upgrades.
 *   - Top-level md files (routing.md, team.md, etc.) are written only if
 *     they don't exist yet — same preservation rule.
 *   - skills/ is written only if missing entirely.
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

  // ── .pwagent/ — canonical, additive sync ────────────────────────────────
  const pwagentDir = join(cwd, ".pwagent");
  const pwagentAgentsDir = join(pwagentDir, "agents");
  await mkdir(pwagentAgentsDir, { recursive: true });

  // Additive agent sync: copy any embedded agent that isn't in .pwagent/agents/ yet.
  const embeddedAgentsDir = join(embedded, "agents");
  if (existsSync(embeddedAgentsDir)) {
    const embeddedAgents = await readdir(embeddedAgentsDir, { withFileTypes: true });
    let added = 0;
    for (const entry of embeddedAgents) {
      if (!entry.isDirectory()) continue;
      const dest = join(pwagentAgentsDir, entry.name);
      if (!existsSync(dest)) {
        await cp(join(embeddedAgentsDir, entry.name), dest, { recursive: true });
        added++;
      }
    }
    if (added > 0) console.log(c.dim(`  synced ${added} new agent(s) to .pwagent/agents/`));
  }

  // Skills: copy only if the directory is entirely absent.
  if (!existsSync(join(pwagentDir, "skills"))) {
    await cp(join(embedded, "skills"), join(pwagentDir, "skills"), { recursive: true });
  }

  // Managed files (team.md, routing.md, master-prompt.md) are owned by pwagent
  // and must always be refreshed so new agents/rules appear after upgrades.
  for (const file of ["routing.md", "team.md", "master-prompt.md"]) {
    try {
      const content = await readFile(join(embedded, file), "utf8");
      await writeFile(join(pwagentDir, file), content, "utf8");
    } catch {
      /* skip missing source file */
    }
  }

  // ceremonies.md is user-customisable — write only if missing.
  if (!existsSync(join(pwagentDir, "ceremonies.md"))) {
    try {
      const content = await readFile(join(embedded, "ceremonies.md"), "utf8");
      await writeFile(join(pwagentDir, "ceremonies.md"), content, "utf8");
    } catch {
      /* skip missing source file */
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
  await ensureCoordinatorManifest(cwd);
  // Resolve squad-cli's binary entry directly so we avoid .cmd-shim issues
  // and npx resolving a different (global/cached) installation.
  const squadCliRoot = findSquadCliRoot();
  let squadCliEntry: string | undefined;
  if (squadCliRoot) {
    const candidate = join(squadCliRoot, "dist", "cli-entry.js");
    if (existsSync(candidate)) squadCliEntry = candidate;
  }

  if (!squadCliEntry) {
    console.error(
      c.err("  squad-cli binary not found — falling back to `npx @bradygaster/squad-cli`"),
    );
  } else {
    console.log(c.dim(`  squad-cli: ${squadCliEntry}`));
  }

  console.log(c.dim("  launching Squad shell…"));
  console.log();

  // Branding env vars — Squad reads squad.brand.json from cwd automatically,
  // but env vars are the authoritative layer and work even if the file is absent.
  const brandEnv = {
    SQUAD_BRAND_NAME: "pwagent",
    SQUAD_BRAND_NAME_UPPER: "PWAGENT",
    SQUAD_BRAND_VERSION: getPwagentVersion(),
    SQUAD_BRAND_PROMPT: "◆ pwagent> ",
    SQUAD_BRAND_NARROW_PROMPT: "pw> ",
    SQUAD_BRAND_ACCENT: "magenta",
    SQUAD_BRAND_BANNER_BORDER_STYLE: "round",
    SQUAD_BRAND_BANNER_BORDER_COLOR: "magenta",
    SQUAD_BRAND_TAGLINE: "Multi-agent Playwright testing — Squad design, GitHub Copilot SDK runtime",
    SQUAD_BRAND_ISSUES_URL: "github.com/microsoft/pwagent",
    SQUAD_BRAND_COORDINATOR: "pwagent",
    SQUAD_HOST: "pwagent",
  };

  return await new Promise<number>((resolvePromise) => {
    const isWin = process.platform === "win32";

    let child;
    if (squadCliEntry) {
      // Direct node spawn — no .cmd-shim issues, no npx-cache surprises.
      child = spawn(process.execPath, [squadCliEntry], {
        cwd,
        stdio: "inherit",
        env: { ...process.env, ...brandEnv },
        shell: false,
      });
    } else {
      // Fallback: npx. On Windows, npx is a .cmd shim and Node ≥18.20.2
      // refuses to spawn .cmd files without shell: true (CVE-2024-27980).
      child = isWin
        ? spawn("npx @bradygaster/squad-cli", {
            cwd,
            stdio: "inherit",
            env: { ...process.env, ...brandEnv },
            shell: true,
          })
        : spawn("npx", ["@bradygaster/squad-cli"], {
            cwd,
            stdio: "inherit",
            env: { ...process.env, ...brandEnv },
            shell: false,
          });
    }

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
