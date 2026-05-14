import { execa } from "execa";
import { existsSync } from "node:fs";
import { delimiter } from "node:path";
import { c, glyph } from "../utils/colors.js";
import { confirm } from "../utils/prompts.js";
import { clearDetectionCache, detect } from "./detect.js";
import type { Prereq } from "./matrix.js";
import { buildInstallCommand, detectPackageManagers, pickInstaller } from "./packageManagers.js";

export interface InstallOptions {
  yes: boolean;
  dryRun: boolean;
}

export interface InstallReport {
  installed: string[];
  skipped: string[];
  failed: { id: string; error: string }[];
  manual: { id: string; url: string }[];
}

/**
 * Common Windows install directories for tools that don't add themselves to
 * PATH at install time. When detection fails after `winget install`, we probe
 * these and prepend to `process.env.PATH` so subsequent installs in the same
 * run (e.g. `az extension add` right after `az` itself) can find the binary.
 */
const POST_INSTALL_PATH_HINTS: Record<string, string[]> = {
  az: [
    "C:\\Program Files\\Microsoft SDKs\\Azure\\CLI2\\wbin",
    "C:\\Program Files (x86)\\Microsoft SDKs\\Azure\\CLI2\\wbin",
  ],
  gh: [
    "C:\\Program Files\\GitHub CLI",
    "C:\\Program Files (x86)\\GitHub CLI",
  ],
};

function tryExtendPath(prereqId: string): boolean {
  const hints = POST_INSTALL_PATH_HINTS[prereqId];
  if (!hints) return false;
  const current = process.env["PATH"] ?? "";
  const parts = current.split(delimiter);
  let added = false;
  for (const dir of hints) {
    if (existsSync(dir) && !parts.includes(dir)) {
      process.env["PATH"] = dir + delimiter + current;
      added = true;
    }
  }
  return added;
}

export async function installPrereqs(targets: Prereq[], opts: InstallOptions): Promise<InstallReport> {
  const report: InstallReport = { installed: [], skipped: [], failed: [], manual: [] };

  const available = await detectPackageManagers();
  console.log(c.dim(`detected package managers: ${available.length > 0 ? available.join(", ") : "none"}`));
  console.log();

  for (let i = 0; i < targets.length; i++) {
    const p = targets[i]!;
    const installer = pickInstaller(p.installers, available);
    if (!installer) {
      report.skipped.push(p.id);
      console.log(`  ${glyph.skip} ${c.bold(p.label)} — no installer available, skipped`);
      continue;
    }
    if (installer.kind === "manual") {
      report.manual.push({ id: p.id, url: installer.url });
      console.log(`  ${glyph.skip} ${c.bold(p.label)} — manual install required: ${c.cyan(installer.url)}`);
      continue;
    }

    const built = buildInstallCommand(installer);
    if (!built) {
      report.skipped.push(p.id);
      continue;
    }

    const cmdLine = (built.sudo ? "sudo " : "") + built.cmd + " " + built.args.join(" ");
    console.log(`  ${i + 1}. ${c.bold(p.label)}`);
    console.log(`     command: ${c.dim(cmdLine)}`);

    if (!opts.yes) {
      const proceed = await confirm("     install?", true);
      if (!proceed) {
        report.skipped.push(p.id);
        console.log(`     ${c.warn("skipped")}`);
        continue;
      }
    }

    if (opts.dryRun) {
      console.log(`     ${c.dim("dry-run — not executed")}`);
      report.skipped.push(p.id);
      continue;
    }

    let installErr: string | undefined;
    try {
      console.log(`     ${c.dim("installing...")}`);
      const finalCmd = built.sudo ? "sudo" : built.cmd;
      const finalArgs = built.sudo ? [built.cmd, ...built.args] : built.args;
      await execa(finalCmd, finalArgs, { stdio: "inherit", timeout: 600_000 });
    } catch (err: unknown) {
      installErr = err instanceof Error ? err.message : String(err);
    }

    // Re-detect: if the prereq is now installed, treat as success regardless of
    // the installer's exit code. Covers:
    //   • winget "already installed" (exit 2316632107) — package present, no upgrade needed
    //   • gh-extension already installed warnings
    //   • npm install -g returning non-zero on benign warnings
    //   • PATH refresh edge cases (probe common locations, extend PATH for this run)
    clearDetectionCache();
    let recheck = await detect(p);
    if (!recheck.installed) {
      const extended = tryExtendPath(p.id);
      if (extended) {
        clearDetectionCache();
        recheck = await detect(p);
        if (recheck.installed) {
          console.log(`     ${c.dim(`(found in install dir; extended PATH for subsequent steps)`)}`);
        }
      }
    }

    if (recheck.installed) {
      console.log(`     ${c.ok("done")}${recheck.version ? c.dim(` (${recheck.version})`) : ""}`);
      report.installed.push(p.id);
    } else {
      const err = installErr ?? recheck.error ?? "install did not produce a detectable binary";
      report.failed.push({ id: p.id, error: err });
      console.log(`     ${c.err("failed")}: ${err.split("\n")[0]}`);
      if (installErr && installErr.toLowerCase().includes("already installed")) {
        console.log(`     ${c.dim("hint: package is already installed, but its install dir isn't on PATH")}`);
        console.log(`     ${c.dim("      → open a NEW terminal and re-run `pwagent doctor --fix`")}`);
      }
    }
    console.log();
  }

  return report;
}
