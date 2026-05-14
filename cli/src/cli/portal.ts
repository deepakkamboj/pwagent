import { Command } from "commander";
import { execa } from "execa";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { c, HR } from "../utils/colors.js";

/**
 * `pwagent portal start` — boots the Next.js dashboard in the sibling portal/ dir.
 *
 * We don't embed Next.js in the main process — it has its own runtime, its own
 * .next build cache, and crash isolation matters. We just shell out to `npm start`
 * (production) or `npm run dev` (with --dev).
 */
const moduleDir = dirname(fileURLToPath(import.meta.url));

function findPortalRoot(): string | undefined {
  const candidates = [
    resolve(moduleDir, "..", "..", "portal"),
    resolve(moduleDir, "..", "..", "..", "portal"),
    resolve(process.cwd(), "portal"),
  ];
  for (const c of candidates) {
    if (existsSync(resolve(c, "package.json"))) return c;
  }
  return undefined;
}

export const portalCommand = new Command("portal").description("Local Next.js dashboard at http://127.0.0.1:7337");

portalCommand
  .command("start")
  .description("Launch the portal (defaults to production build; use --dev for hot-reload)")
  .option("--dev", "run via next dev instead of next start")
  .option("--port <n>", "override the port (default 7337)")
  .option("--read-only", "disable all write actions (Server Actions return 'portal is in --read-only mode')")
  .option("--bind-all", "bind to 0.0.0.0 instead of 127.0.0.1 — disables loopback enforcement; use behind a trusted reverse proxy only")
  .action(async (opts: { dev?: boolean; port?: string; readOnly?: boolean; bindAll?: boolean }) => {
    const root = findPortalRoot();
    if (!root) {
      console.error(c.err("portal/ directory not found — is the repo intact?"));
      process.exitCode = 1;
      return;
    }
    const port = opts.port ?? "7337";
    console.log(HR);
    console.log(`  ${c.bold("pwagent portal")} ${c.dim("→")} http://${opts.bindAll ? "0.0.0.0" : "127.0.0.1"}:${port}`);
    console.log(c.dim(`  cwd: ${root}`));
    console.log(c.dim(`  mode: ${opts.dev ? "dev" : "prod"}${opts.readOnly ? " · read-only" : ""}${opts.bindAll ? " · bind-all" : ""}`));
    if (opts.bindAll) {
      console.log(c.warn("  ⚠  --bind-all disables loopback enforcement. Use only behind a trusted reverse proxy."));
    }
    console.log(HR);
    const script = opts.dev ? "dev" : "start";
    try {
      const portalEnv: NodeJS.ProcessEnv = {
        ...process.env,
        PORT: port,
      };
      if (opts.readOnly) portalEnv["PWAGENT_PORTAL_READ_ONLY"] = "1";
      if (opts.bindAll) portalEnv["PWAGENT_PORTAL_BIND_ALL"] = "1";

      const hostArgs = opts.bindAll ? ["-H", "0.0.0.0"] : [];
      await execa("npm", ["run", script, "--", "-p", port, ...hostArgs], {
        cwd: root,
        stdio: "inherit",
        env: portalEnv,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("ENOENT")) {
        console.error(c.err("npm not found — install Node.js first"));
      } else {
        console.error(c.err(`portal exited: ${msg.split("\n")[0]}`));
      }
      process.exitCode = 1;
    }
  });

portalCommand
  .command("stop")
  .description("Kill any running portal process bound to 7337 (no-op on Windows without psutil-style tooling)")
  .action(() => {
    console.log(c.dim("  use Ctrl+C in the terminal hosting `pwagent portal start`"));
  });

portalCommand
  .command("status")
  .description("Check whether the portal is reachable")
  .option("--port <n>", "port to probe", "7337")
  .action(async (opts: { port: string }) => {
    try {
      const res = await fetch(`http://127.0.0.1:${opts.port}/`, { signal: AbortSignal.timeout(3_000) });
      console.log(c.ok(`✓ portal reachable on :${opts.port} (HTTP ${res.status})`));
    } catch {
      console.log(c.dim(`portal not reachable on :${opts.port} — run \`pwagent portal start\``));
      process.exitCode = 1;
    }
  });
