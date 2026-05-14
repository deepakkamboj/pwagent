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
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { c } from "../utils/colors.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/** Locate squad-cli's install root regardless of where it was hoisted to. */
function findSquadCliRoot(): string | undefined {
  try {
    const pkgPath = require.resolve("@bradygaster/squad-cli/package.json");
    return dirname(pkgPath);
  } catch {
    return undefined;
  }
}

/**
 * Rebrand Squad CLI's shell components in place so the user sees pwagent
 * everywhere instead of squad. Two strings live in compiled React (Ink)
 * components and aren't otherwise configurable:
 *   - banner text "SQUAD" → "PWAGENT"
 *   - prompt label "squad>" / "sq>" → "pwagent>" / "pw>"
 *
 * The patch is **idempotent** — on each launch we check whether the strings
 * still exist, only writing if they do. If npm reinstalls Squad and wipes our
 * patches, the next `pwagent` invocation reapplies them.
 *
 * Risk: Squad's UI surface changes across versions. We detect "didn't find
 * any of the expected patterns" and skip silently rather than crashing.
 */
async function rebrandSquadShell(verbose = false): Promise<void> {
  const root = findSquadCliRoot();
  if (!root) {
    if (verbose) console.log(c.dim("  rebrand: squad-cli not resolvable from here"));
    return;
  }
  if (verbose) console.log(c.dim(`  rebrand: patching ${root}`));

  const targets: Array<{ path: string; replacements: Array<[RegExp, string]> }> = [
    {
      path: join(root, "dist", "cli", "shell", "components", "App.js"),
      replacements: [
        [/children: "SQUAD"/g, 'children: "PWAGENT"'],
        [/children: \["SQUAD v"/g, 'children: ["PWAGENT v"'],
      ],
    },
    {
      path: join(root, "dist", "cli", "shell", "components", "InputPrompt.js"),
      replacements: [
        [/'◆ squad> '/g, "'◆ pwagent> '"],
        [/'sq> '/g, "'pw> '"],
      ],
    },
  ];

  for (const t of targets) {
    if (!existsSync(t.path)) {
      if (verbose) console.log(c.dim(`    skip: ${t.path} (not found)`));
      continue;
    }
    try {
      let src = await readFile(t.path, "utf8");
      let changed = false;
      const hits: string[] = [];
      for (const [pat, repl] of t.replacements) {
        if (pat.test(src)) {
          src = src.replace(pat, repl);
          changed = true;
          hits.push(pat.source);
        }
      }
      if (changed) {
        await writeFile(t.path, src, "utf8");
        if (verbose) console.log(c.dim(`    patched: ${t.path} (${hits.length} patterns)`));
      } else if (verbose) {
        console.log(c.dim(`    ok:      ${t.path} (already patched or new layout)`));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (verbose) console.log(c.dim(`    fail:    ${t.path} (${msg})`));
    }
  }
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
  await ensureCoordinatorManifest(cwd);
  // Verbose during pivot phase so the user can see exactly what's being
  // patched; flip to silent once the rebrand is stable across squad-cli versions.
  await rebrandSquadShell(true);

  // Resolve squad-cli's binary entry **before** spawning so we run the exact
  // copy we just patched. Using `npx` may resolve to a different installation
  // (global, npx cache) where our patches don't exist.
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
    console.error(c.dim("  → patches may not apply to the npx-resolved copy"));
  } else {
    console.log(c.dim(`  squad-cli: ${squadCliEntry}`));
  }

  console.log(c.dim("  launching GitHub Copilot CLI via Squad…"));
  console.log();

  return await new Promise<number>((resolvePromise) => {
    const isWin = process.platform === "win32";

    let child;
    if (squadCliEntry) {
      // Direct node spawn — same copy we patched, no .cmd-shim issues, no
      // npx-cache surprises.
      child = spawn(process.execPath, [squadCliEntry], {
        cwd,
        stdio: "inherit",
        env: { ...process.env, SQUAD_HOST: "pwagent" },
        shell: false,
      });
    } else {
      // Fallback: npx (may not see our patches). On Windows, npx is a .cmd
      // shim and Node ≥18.20.2/20.12.2/21.7.3 refuses to spawn .cmd files
      // without shell: true (CVE-2024-27980).
      child = isWin
        ? spawn("npx @bradygaster/squad-cli", {
            cwd,
            stdio: "inherit",
            env: { ...process.env, SQUAD_HOST: "pwagent" },
            shell: true,
          })
        : spawn("npx", ["@bradygaster/squad-cli"], {
            cwd,
            stdio: "inherit",
            env: { ...process.env, SQUAD_HOST: "pwagent" },
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
