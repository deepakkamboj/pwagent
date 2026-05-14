import { Command } from "commander";
import { execa } from "execa";
import { writeFileSync, existsSync, unlinkSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { c, glyph, HR } from "../utils/colors.js";
import { confirm } from "../utils/prompts.js";

/**
 * `pwagent service install` — register the scheduler as a platform-native service
 * so `pwagent scheduler start --daemon` runs at boot / login without a manual step.
 *
 *   - Windows: Task Scheduler XML (AtLogOn trigger) installed via schtasks
 *   - macOS:   launchd user agent (~/Library/LaunchAgents/com.pwagent.scheduler.plist)
 *   - Linux:   systemd --user unit (~/.config/systemd/user/pwagent-scheduler.service)
 *
 * Symmetric `uninstall` and `status` subcommands.
 */

const SERVICE_ID = "pwagent-scheduler";
const LAUNCHD_ID = "com.pwagent.scheduler";

interface ResolvedPaths {
  node: string;
  cli: string;
  logDir: string;
}

function resolvePaths(): ResolvedPaths {
  // Find the cli binary: in monorepo it's <repo>/cli/dist/index.js.
  // We resolve relative to this module's compiled location.
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  // moduleDir is .../cli/dist/cli; cli/dist/index.js is two levels up.
  const cli = join(moduleDir, "..", "index.js");
  return {
    node: process.execPath,
    cli,
    logDir: join(homedir(), ".pwagent", "logs", "service"),
  };
}

export const serviceCommand = new Command("service").description("Install pwagent scheduler as a platform-native service");

serviceCommand
  .command("install")
  .description("Register the scheduler to start at boot/login")
  .option("-y, --yes", "skip the confirmation prompt")
  .action(async (opts: { yes?: boolean }) => {
    const p = resolvePaths();
    if (!existsSync(p.cli)) {
      console.error(c.err(`could not find pwagent CLI at ${p.cli}`));
      console.error(c.dim("  → run `npm run build` from the repo root first"));
      process.exitCode = 1;
      return;
    }
    await mkdir(p.logDir, { recursive: true });

    console.log(HR);
    console.log(`  ${c.bold("pwagent service install")}`);
    console.log(c.dim(`  platform: ${platform()}`));
    console.log(c.dim(`  node:     ${p.node}`));
    console.log(c.dim(`  cli:      ${p.cli}`));
    console.log(c.dim(`  log dir:  ${p.logDir}`));
    console.log(HR);

    if (!opts.yes) {
      const proceed = await confirm("install?", true);
      if (!proceed) return;
    }

    try {
      if (platform() === "win32") await installWindows(p);
      else if (platform() === "darwin") await installMacOS(p);
      else await installLinux(p);
      console.log(c.ok(`  ${glyph.ok} installed`));
      console.log(c.dim(`  inspect: pwagent service status`));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(c.err(`install failed: ${msg.split("\n")[0]}`));
      process.exitCode = 1;
    }
  });

serviceCommand
  .command("uninstall")
  .description("Remove the scheduler service registration")
  .option("-y, --yes", "skip confirmation")
  .action(async (opts: { yes?: boolean }) => {
    if (!opts.yes) {
      const proceed = await confirm("uninstall scheduler service?", true);
      if (!proceed) return;
    }
    try {
      if (platform() === "win32") await uninstallWindows();
      else if (platform() === "darwin") await uninstallMacOS();
      else await uninstallLinux();
      console.log(c.ok(`  ${glyph.ok} uninstalled`));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(c.err(`uninstall failed: ${msg.split("\n")[0]}`));
      process.exitCode = 1;
    }
  });

serviceCommand
  .command("status")
  .description("Report whether the scheduler service is registered + running")
  .action(async () => {
    try {
      if (platform() === "win32") await statusWindows();
      else if (platform() === "darwin") await statusMacOS();
      else await statusLinux();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(c.dim(msg.split("\n")[0]));
    }
  });

// ── Windows ────────────────────────────────────────────────────────────────

async function installWindows(p: ResolvedPaths): Promise<void> {
  // We use schtasks rather than the more modern Register-ScheduledTask cmdlet
  // so this works in cmd.exe and PowerShell both, without elevation.
  const xml = `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.3" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>pwagent scheduler — runs recurring agent jobs declared in ~/.pwagent/config.json</Description>
    <Author>pwagent</Author>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
      <UserId>${escapeXml(process.env["USERNAME"] ?? "")}</UserId>
    </LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${escapeXml(p.node)}</Command>
      <Arguments>${escapeXml(`"${p.cli}" scheduler start`)}</Arguments>
      <WorkingDirectory>${escapeXml(homedir())}</WorkingDirectory>
    </Exec>
  </Actions>
</Task>`;
  const xmlPath = join(homedir(), ".pwagent", "service", "task.xml");
  await mkdir(dirname(xmlPath), { recursive: true });
  // UTF-16 LE with BOM for schtasks
  const buf = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(xml, "utf16le")]);
  writeFileSync(xmlPath, buf);
  await execa("schtasks", ["/Create", "/TN", SERVICE_ID, "/XML", xmlPath, "/F"], { stdio: "inherit" });
}

async function uninstallWindows(): Promise<void> {
  await execa("schtasks", ["/Delete", "/TN", SERVICE_ID, "/F"], { stdio: "inherit" });
  const xmlPath = join(homedir(), ".pwagent", "service", "task.xml");
  if (existsSync(xmlPath)) unlinkSync(xmlPath);
}

async function statusWindows(): Promise<void> {
  const r = await execa("schtasks", ["/Query", "/TN", SERVICE_ID, "/V", "/FO", "LIST"], { reject: false });
  if (r.exitCode !== 0) {
    console.log(c.dim(`not registered (run: pwagent service install)`));
    process.exitCode = 1;
    return;
  }
  console.log(r.stdout);
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── macOS (launchd) ────────────────────────────────────────────────────────

const launchdPath = () => join(homedir(), "Library", "LaunchAgents", `${LAUNCHD_ID}.plist`);

async function installMacOS(p: ResolvedPaths): Promise<void> {
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCHD_ID}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${p.node}</string>
    <string>${p.cli}</string>
    <string>scheduler</string>
    <string>start</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${join(p.logDir, "scheduler.out.log")}</string>
  <key>StandardErrorPath</key>
  <string>${join(p.logDir, "scheduler.err.log")}</string>
  <key>WorkingDirectory</key>
  <string>${homedir()}</string>
</dict>
</plist>`;
  await mkdir(dirname(launchdPath()), { recursive: true });
  writeFileSync(launchdPath(), plist, "utf8");
  await execa("launchctl", ["unload", launchdPath()], { reject: false });
  await execa("launchctl", ["load", launchdPath()], { stdio: "inherit" });
}

async function uninstallMacOS(): Promise<void> {
  const p = launchdPath();
  await execa("launchctl", ["unload", p], { reject: false });
  if (existsSync(p)) unlinkSync(p);
}

async function statusMacOS(): Promise<void> {
  if (!existsSync(launchdPath())) {
    console.log(c.dim(`not registered (run: pwagent service install)`));
    process.exitCode = 1;
    return;
  }
  const r = await execa("launchctl", ["list", LAUNCHD_ID], { reject: false });
  if (r.exitCode === 0) console.log(r.stdout);
  else console.log(c.dim("registered but not loaded"));
}

// ── Linux (systemd --user) ─────────────────────────────────────────────────

const systemdPath = () => join(homedir(), ".config", "systemd", "user", `${SERVICE_ID}.service`);

async function installLinux(p: ResolvedPaths): Promise<void> {
  const unit = `[Unit]
Description=pwagent scheduler — runs recurring agent jobs declared in ~/.pwagent/config.json
After=network.target

[Service]
Type=simple
ExecStart=${p.node} ${p.cli} scheduler start
WorkingDirectory=${homedir()}
StandardOutput=append:${join(p.logDir, "scheduler.out.log")}
StandardError=append:${join(p.logDir, "scheduler.err.log")}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
`;
  await mkdir(dirname(systemdPath()), { recursive: true });
  writeFileSync(systemdPath(), unit, "utf8");
  await execa("systemctl", ["--user", "daemon-reload"], { stdio: "inherit" });
  await execa("systemctl", ["--user", "enable", "--now", SERVICE_ID], { stdio: "inherit" });
}

async function uninstallLinux(): Promise<void> {
  await execa("systemctl", ["--user", "disable", "--now", SERVICE_ID], { reject: false });
  const p = systemdPath();
  if (existsSync(p)) unlinkSync(p);
  await execa("systemctl", ["--user", "daemon-reload"], { reject: false });
}

async function statusLinux(): Promise<void> {
  if (!existsSync(systemdPath())) {
    console.log(c.dim(`not registered (run: pwagent service install)`));
    process.exitCode = 1;
    return;
  }
  await execa("systemctl", ["--user", "status", SERVICE_ID, "--no-pager"], { stdio: "inherit", reject: false });
}
