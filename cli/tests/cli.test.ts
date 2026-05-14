import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execa } from "execa";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * End-to-end smoke tests for the CLI binary. These spawn `node dist/index.js`,
 * so they require a prior `npm run build`. They exercise commands that don't
 * call the model, so they're safe to run in CI without API keys.
 */

const CLI = join(process.cwd(), "dist", "index.js");

describe("CLI smoke tests", () => {
  let tmpHome: string;

  beforeAll(async () => {
    tmpHome = await mkdtemp(join(tmpdir(), "pwagent-cli-test-"));
  });

  afterAll(async () => {
    await rm(tmpHome, { recursive: true, force: true });
  });

  function run(args: string[]) {
    return execa("node", [CLI, ...args], {
      env: { ...process.env, PWAGENT_HOME: tmpHome },
      reject: false,
      timeout: 30_000,
    });
  }

  it("--version prints semver", async () => {
    const r = await run(["--version"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("--help lists working and stub commands", async () => {
    const r = await run(["--help"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("init");
    expect(r.stdout).toContain("login");
    expect(r.stdout).toContain("logout");
    expect(r.stdout).toContain("whoami");
    expect(r.stdout).toContain("doctor");
    expect(r.stdout).toContain("prereqs");
    expect(r.stdout).toContain("agents");
    expect(r.stdout).toContain("skills");
    expect(r.stdout).toContain("config");
    expect(r.stdout).toContain("run");
    expect(r.stdout).toContain("scheduler");
    expect(r.stdout).toContain("portal");
  });

  it("agents list shows the v0.3 simplified roster (10 charters)", async () => {
    const r = await run(["agents", "list"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/generate/);
    expect(r.stdout).toMatch(/heal/);
    expect(r.stdout).toMatch(/validate/);
    expect(r.stdout).toMatch(/supervisor/);
    expect(r.stdout).toMatch(/10 charters/);
  });

  it("agents show <name> prints the charter body", async () => {
    const r = await run(["agents", "show", "heal"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("heal");
  });

  it("agents show <unknown> exits non-zero", async () => {
    const r = await run(["agents", "show", "definitely-not-a-real-agent"]);
    expect(r.exitCode).toBe(1);
  });

  it("skills list shows multiple packs", async () => {
    const r = await run(["skills", "list"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("core/");
    expect(r.stdout).toContain("ci/");
  });

  it("skills list --pack core narrows to one pack", async () => {
    const r = await run(["skills", "list", "--pack", "core"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("core/");
    expect(r.stdout).not.toMatch(/^\s+ci\//m);
  });

  it("config view before init exits non-zero with a helpful message", async () => {
    const r = await run(["config", "view"]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout + r.stderr).toMatch(/no config|run pwagent init/);
  });

  it("init --yes writes the default config", async () => {
    const r = await run(["init", "--yes"]);
    expect(r.exitCode).toBe(0);
    const view = await run(["config", "view"]);
    expect(view.exitCode).toBe(0);
    expect(view.stdout).toContain("pwagent");
    expect(view.stdout).toContain("claude-sonnet-4.5");
  });

  it("config get provider.clientName returns the string", async () => {
    const r = await run(["config", "get", "provider.clientName"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("pwagent");
  });

  it("config set updates a value", async () => {
    const set = await run(["config", "set", "ado.project", "Engineering"]);
    expect(set.exitCode).toBe(0);
    const get = await run(["config", "get", "ado.project"]);
    expect(get.stdout.trim()).toBe("Engineering");
  });

  it("pwagent run --dry-run renders system prompt without calling the model", async () => {
    // ensure a config is in place so the runtime can resolve model defaults
    await run(["init", "--yes"]);
    const r = await run(["run", "triage", "--dry-run", "classify run 12345"]);
    // dry-run never touches the SDK — exit code should be 0
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("system prompt");
    expect(r.stdout).toContain("triage");
  });

  it("pwagent scheduler list is empty by default (schedules live in config.json now)", async () => {
    const r = await run(["scheduler", "list"]);
    expect(r.exitCode).toBe(0);
    // After `init --yes` (no schedules), the list should report "no jobs configured".
    expect(r.stdout + r.stderr).toMatch(/no jobs configured|0 enabled/);
  });
});
