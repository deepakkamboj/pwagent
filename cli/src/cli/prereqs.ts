import { Command } from "commander";
import { c, glyph, HR } from "../utils/colors.js";
import { PREREQS, type Prereq, type Tier } from "../prereqs/matrix.js";
import { detect } from "../prereqs/detect.js";
import { installPrereqs } from "../prereqs/install.js";
import { detectPackageManagers, pickInstaller } from "../prereqs/packageManagers.js";

export const prereqsCommand = new Command("prereqs")
  .description("Verify prerequisites; optionally install missing ones")
  .option("--install [ids...]", "install missing prereqs (optionally specify ids)")
  .option("--include-optional", "include optional prereqs when installing all")
  .option("--skip <ids...>", "exclude specific ids from --install all")
  .option("--yes", "accept all install prompts without confirmation")
  .option("--dry-run", "show what would be installed without executing")
  .action(async (opts: {
    install?: boolean | string[];
    includeOptional?: boolean;
    skip?: string[];
    yes?: boolean;
    dryRun?: boolean;
  }) => {
    console.log(c.bold("pwagent prereqs"));
    console.log(HR);

    const results = await Promise.all(
      PREREQS.map(async (p) => ({ p, det: await detect(p) })),
    );

    // group by tier
    const tiers: Record<Tier, typeof results> = { required: [], recommended: [], optional: [] };
    for (const r of results) tiers[r.p.tier].push(r);

    const pmAvail = await detectPackageManagers();

    for (const tier of ["required", "recommended", "optional"] as Tier[]) {
      console.log(c.bold(tier));
      for (const { p, det } of tiers[tier]) {
        printPrereqRow(p, det, pmAvail);
      }
      console.log();
    }

    console.log(c.bold("provider"));
    console.log(c.dim("  pwagent uses GitHub Copilot via @github/copilot-sdk."));
    console.log(c.dim("  Auth: gh auth login (Copilot subscription required) — verified above as `gh auth (logged in)`."));
    console.log(HR);

    const missing = results.filter(({ det }) => !det.installed).map(({ p }) => p);
    const missingRec = missing.filter((p) => p.tier === "recommended");
    const missingOpt = missing.filter((p) => p.tier === "optional");
    const missingReq = missing.filter((p) => p.tier === "required");

    if (missingReq.length > 0) {
      console.log(
        c.err(`${missingReq.length} required prereq${missingReq.length === 1 ? "" : "s"} missing: ${missingReq.map((p) => p.id).join(", ")}`),
      );
    }
    console.log(
      `${missingRec.length} missing recommended · ${missingOpt.length} missing optional`,
    );

    if (opts.install === undefined) {
      if (missing.length > 0) {
        console.log(
          c.dim("run: ") +
            "pwagent prereqs --install" +
            c.dim("              (install all recommended)"),
        );
        console.log(
          c.dim("     ") +
            "pwagent prereqs --install --include-optional" +
            c.dim("  (everything we can)"),
        );
      }
      return;
    }

    // --install path
    let targets: Prereq[] = [];
    const explicitIds = Array.isArray(opts.install) ? opts.install : [];
    if (explicitIds.length > 0) {
      targets = PREREQS.filter((p) => explicitIds.includes(p.id));
      const unknown = explicitIds.filter((id) => !PREREQS.some((p) => p.id === id));
      if (unknown.length > 0) {
        console.log(c.warn(`unknown ids ignored: ${unknown.join(", ")}`));
      }
    } else {
      targets = missing.filter((p) => p.tier === "recommended" || (opts.includeOptional && p.tier === "optional"));
      if (opts.skip) targets = targets.filter((p) => !opts.skip!.includes(p.id));
    }

    if (targets.length === 0) {
      console.log(c.ok("nothing to install"));
      return;
    }

    console.log();
    console.log(c.bold(`About to install ${targets.length} dependenc${targets.length === 1 ? "y" : "ies"}:`));
    console.log();

    const report = await installPrereqs(targets, { yes: opts.yes === true, dryRun: opts.dryRun === true });

    console.log(HR);
    console.log(
      `${report.installed.length} installed · ${report.skipped.length} skipped · ${report.failed.length} failed · ${report.manual.length} manual`,
    );
    if (report.installed.length > 0) {
      console.log(c.dim("run: pwagent doctor    (verify)"));
    }
    if (report.failed.length > 0) {
      process.exitCode = 1;
    }
  });

function printPrereqRow(p: Prereq, det: { installed: boolean; version?: string; error?: string }, _pmAvail: string[]): void {
  if (det.installed) {
    const v = det.version ? c.dim(det.version) : "";
    console.log(`  [${glyph.ok}] ${p.label.padEnd(20)} ${v}`);
    return;
  }
  const manualOnly = !pickInstaller(p.installers, _pmAvail as never) || pickInstaller(p.installers, _pmAvail as never)?.kind === "manual";
  const status = manualOnly ? `manual install required` : "not installed";
  console.log(`  [${manualOnly ? glyph.skip : glyph.err}] ${p.label.padEnd(20)} ${c.dim(status)}`);
  if (!manualOnly) {
    console.log(c.dim(`                          install: pwagent prereqs --install ${p.id}`));
  } else {
    const manual = p.installers.find((i) => i.kind === "manual");
    if (manual && "url" in manual) {
      console.log(c.dim(`                          download: ${manual.url}`));
    }
  }
}
