import { Command } from "commander";
import { c, glyph, HR } from "../utils/colors.js";
import { configExists, loadConfig } from "../config/loader.js";
import { paths } from "../utils/paths.js";
import { loadCharters } from "../charters/loader.js";
import { loadSkills } from "../skills/loader.js";
import { PREREQS } from "../prereqs/matrix.js";
import { detect } from "../prereqs/detect.js";
import { installPrereqs } from "../prereqs/install.js";
import { fileExists } from "../utils/files.js";
import { probeCopilotReachable } from "../runtime/provider.js";
import { showBanner, shouldShowBanner } from "../utils/banner.js";
import packageJson from "../../package.json" with { type: "json" };

export const doctorCommand = new Command("doctor")
  .description("Diagnose installation, prereqs, config, and feature availability")
  .option("--fix", "auto-install ALL missing prereqs (required + recommended) then re-verify")
  .option("--no-probe", "skip the live Copilot SDK reachability probe")
  .option("--probe-timeout <ms>", "max ms to wait for the SDK probe", "5000")
  .option("--no-banner", "skip the ASCII banner at the top")
  .action(async (opts: { fix?: boolean; probe?: boolean; probeTimeout?: string; banner?: boolean }) => {
    if (opts.banner !== false && shouldShowBanner()) showBanner();
    console.log(HR);

    console.log(`  binary version    ${c.bold((packageJson as { version: string }).version)}`);

    const charters = await loadCharters();
    const embedded = charters.list.filter((c) => c.source === "embedded").length;
    const workspace = charters.list.filter((c) => c.source !== "embedded").length;
    console.log(
      `  charters          ${embedded} ${c.dim("(embedded)")}` +
        (workspace > 0 ? ` + ${workspace} ${c.dim("(workspace/user override)")}` : ""),
    );

    const skills = await loadSkills();
    const skillsEmb = skills.list.filter((s) => s.source === "embedded").length;
    console.log(`  skills            ${skillsEmb} ${c.dim("(embedded)")}`);

    const cfgOK = await configExists();
    if (cfgOK) {
      console.log(`  config            ${paths.config}    ${c.ok("OK")}`);
    } else {
      console.log(`  config            ${paths.config}    ${c.warn("missing — run pwagent init")}`);
    }

    let providerLine = "unknown";
    if (cfgOK) {
      const cfg = await loadConfig();
      providerLine = `github-copilot-sdk (${cfg.provider.model})`;
    }
    console.log(`  provider          ${providerLine}`);

    // R4: live SDK reachability probe — actually try to import + connect.
    if (opts.probe !== false) {
      const timeout = Math.max(1000, Math.min(30_000, parseInt(opts.probeTimeout ?? "5000", 10) || 5000));
      process.stdout.write(`  copilot probe     ${c.dim(`(${timeout / 1000}s timeout) …`)}\r`);
      const probe = await probeCopilotReachable(timeout);
      // overwrite the inline placeholder with the result
      process.stdout.write("[2K\r");
      const icon = probe.reachable ? glyph.ok : probe.status === "sdk-missing" ? glyph.err : glyph.pending;
      console.log(`  copilot probe     [${icon}] ${probe.message} ${c.dim(`(${probe.durationMs}ms)`)}`);
      if (!probe.reachable) {
        if (probe.status === "sdk-missing") {
          console.log(c.dim("                     → run `npm install` in the pwagent dir"));
        } else if (probe.status === "auth-missing") {
          console.log(c.dim("                     → run `pwagent login` (or `gh auth login`)"));
        } else if (probe.state && probe.state !== "connected") {
          console.log(c.dim(`                     → state=${probe.state}; try \`pwagent login\` and retry`));
        }
      }
    }

    // prereqs grouped
    console.log("  prerequisites");
    const results = await Promise.all(PREREQS.map(async (p) => ({ p, det: await detect(p) })));
    const required = results.filter(({ p }) => p.tier === "required");
    const recommended = results.filter(({ p }) => p.tier === "recommended");
    const optional = results.filter(({ p }) => p.tier === "optional");
    console.log(`    required        ${tierLine(required)}`);
    console.log(`    recommended     ${tierLine(recommended)}`);
    console.log(`    optional        ${tierLine(optional)}`);

    // features unlocked
    const unlocked = new Set<string>();
    const blocked = new Map<string, string[]>(); // feature -> [missing prereq ids]
    for (const { p, det } of results) {
      for (const feat of p.unlocks) {
        if (det.installed) {
          unlocked.add(feat);
        } else {
          const cur = blocked.get(feat) ?? [];
          cur.push(p.id);
          blocked.set(feat, cur);
        }
      }
    }
    // a feature is truly unlocked only if all prereqs that mention it are installed
    for (const blocked_feat of blocked.keys()) unlocked.delete(blocked_feat);

    console.log("  features");
    const featureLabels: Record<string, string> = {
      "test execution": "test execution",
      "ADO triage": "ADO triage",
      "ADO PRs": "ADO PRs",
      "GitHub PRs": "GitHub PRs",
      "GitHub Issues": "GitHub Issues",
      "a11y verify": "a11y verify",
      "flake finder": "flake finder",
      "chat wrapper": "chat wrapper",
      "provider:copilot": "provider: copilot",
    };
    for (const [feat, label] of Object.entries(featureLabels)) {
      if (unlocked.has(feat)) {
        console.log(`    ${label.padEnd(16)} ${c.ok("available")}`);
      } else if (blocked.has(feat)) {
        const missing = blocked.get(feat)!.join(", ");
        console.log(`    ${label.padEnd(16)} ${c.warn("disabled")} ${c.dim(`(missing: ${missing})`)}`);
      }
    }

    const schedRunning = fileExists(`${paths.scheduler}/pwagent-scheduler.pid`);
    console.log(
      `  scheduler         ${schedRunning ? c.ok("running") : c.dim("not running") + c.dim("    (run: pwagent scheduler start)")}`,
    );

    console.log(HR);

    const reqMissing = required.filter(({ det }) => !det.installed);
    const recMissing = recommended.filter(({ det }) => !det.installed);

    // --fix: install missing required AND recommended in one pass.
    if (opts.fix && (reqMissing.length > 0 || recMissing.length > 0)) {
      const toInstall = [...reqMissing, ...recMissing].map(({ p }) => p);
      console.log(
        c.bold(
          `\n--fix: installing ${toInstall.length} missing prereq${toInstall.length === 1 ? "" : "s"} ` +
            `(${reqMissing.length} required, ${recMissing.length} recommended)\n`,
        ),
      );
      await installPrereqs(toInstall, { yes: true, dryRun: false });
      console.log();
      console.log(c.dim("re-run pwagent doctor to verify"));
      return;
    }

    if (reqMissing.length > 0) {
      console.log(c.err(`${reqMissing.length} required prereq${reqMissing.length === 1 ? "" : "s"} missing.`));
      printActionBox(["pwagent prereqs --install", "or: pwagent doctor --fix"]);
      process.exit(1);
    }
    if (recMissing.length === 0) {
      console.log(c.ok("Ready."));
    } else if (opts.fix) {
      // unreachable — handled above; kept for type safety
      console.log(c.bold(`\n--fix: installing ${recMissing.length} recommended prereq${recMissing.length === 1 ? "" : "s"}\n`));
      await installPrereqs(
        recMissing.map(({ p }) => p),
        { yes: true, dryRun: false },
      );
      console.log();
      console.log(c.dim("re-run pwagent doctor to verify"));
    } else {
      console.log(c.warn(`${recMissing.length} recommended prereq${recMissing.length === 1 ? "" : "s"} missing.`));
      printActionBox(["pwagent prereqs --install", "or: pwagent doctor --fix"]);
    }
    // Force-exit: doctor is a one-shot diagnostic; any rogue handles left by the
    // Copilot SDK probe or prereq detection should not keep the process alive.
    process.exit(process.exitCode ?? 0);
  });

function tierLine(results: { p: { id: string; label: string }; det: { installed: boolean } }[]): string {
  return results
    .map(({ p, det }) => `${p.label} ${det.installed ? glyph.ok : glyph.err}`)
    .join(c.dim(" · "));
}

/**
 * Print a visually distinct call-to-action box around the next-step command(s).
 * Box width adapts to the longest line; we cap at terminal width so it doesn't
 * wrap. Uses box-drawing chars for a clean look:
 *
 *   ╔═════════════════════════════════════╗
 *   ║  run: pwagent prereqs --install     ║
 *   ║       or: pwagent doctor --fix      ║
 *   ╚═════════════════════════════════════╝
 */
function printActionBox(lines: string[]): void {
  if (lines.length === 0) return;
  const labels = lines.map((l, i) => (i === 0 ? `run: ${l}` : `     ${l}`));
  const termWidth = (process.stdout.columns ?? 80) - 2;
  const width = Math.min(Math.max(...labels.map((l) => l.length)) + 4, termWidth);
  const top = "╔" + "═".repeat(width - 2) + "╗";
  const bottom = "╚" + "═".repeat(width - 2) + "╝";
  console.log();
  console.log(c.cyan(top));
  for (const label of labels) {
    const pad = " ".repeat(Math.max(0, width - 4 - label.length));
    console.log(c.cyan("║ ") + c.bold(label) + pad + c.cyan(" ║"));
  }
  console.log(c.cyan(bottom));
}
