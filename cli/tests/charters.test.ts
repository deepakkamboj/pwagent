import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTmpHome } from "./helpers/tmpHome.js";

describe("charter loader", () => {
  let cleanup: () => Promise<void>;
  let home: string;

  beforeEach(async () => {
    vi.resetModules();
    const t = await createTmpHome();
    cleanup = t.cleanup;
    home = t.home;
  });

  afterEach(async () => {
    await cleanup();
  });

  it("loads the simplified v0.3 roster of charters", async () => {
    const { loadCharters } = await import("../src/charters/loader.js");
    const { list } = await loadCharters();
    const names = list.map((c) => c.name);
    expect(names.length).toBe(10);
    for (const expected of [
      "generate", "heal", "plan", "scenario", "report",
      "validate", "auth", "triage", "review", "supervisor",
    ]) {
      expect(names, `expected ${expected} in roster`).toContain(expected);
    }
  });

  it("strips the pwagent- prefix from charter names", async () => {
    const { loadCharters } = await import("../src/charters/loader.js");
    const { list } = await loadCharters();
    expect(list.find((c) => c.name === "triage")).toBeDefined();
    expect(list.find((c) => c.name === "pwagent-triage")).toBeUndefined();
  });

  it("parses frontmatter description into the description field", async () => {
    const { findCharter } = await import("../src/charters/loader.js");
    const triage = await findCharter("triage");
    expect(triage).toBeDefined();
    expect(triage!.description.length).toBeGreaterThan(20);
    expect(triage!.source).toBe("embedded");
  });

  it("returns undefined for an unknown charter name", async () => {
    const { findCharter } = await import("../src/charters/loader.js");
    expect(await findCharter("nonexistent-agent")).toBeUndefined();
  });

  it("workspace .squad/ overrides take precedence over embedded charters (Squad compat)", async () => {
    const wsRoot = home;
    const wsAgent = join(wsRoot, ".squad", "agents", "triage");
    await mkdir(wsAgent, { recursive: true });
    await writeFile(
      join(wsAgent, "charter.md"),
      [
        "---",
        "name: pwagent-triage",
        "description: SQUAD OVERRIDE — custom triage rules for this repo",
        "---",
        "",
        "# overridden body",
        "",
      ].join("\n"),
      "utf8",
    );

    const { findCharter } = await import("../src/charters/loader.js");
    const triage = await findCharter("triage", wsRoot);
    expect(triage).toBeDefined();
    expect(triage!.source).toBe("workspace");
    expect(triage!.description).toMatch(/SQUAD OVERRIDE/);
  });

  it("workspace .pwagent/ wins over .squad/ when both exist (preferred convention)", async () => {
    const wsRoot = home;
    // Both directories present with the same agent.
    const squadDir = join(wsRoot, ".squad", "agents", "triage");
    const pwagentDir = join(wsRoot, ".pwagent", "agents", "triage");
    await mkdir(squadDir, { recursive: true });
    await mkdir(pwagentDir, { recursive: true });
    await writeFile(
      join(squadDir, "charter.md"),
      "---\nname: triage\ndescription: SQUAD VARIANT\n---\nbody",
      "utf8",
    );
    await writeFile(
      join(pwagentDir, "charter.md"),
      "---\nname: triage\ndescription: PWAGENT VARIANT\n---\nbody",
      "utf8",
    );

    const { findCharter } = await import("../src/charters/loader.js");
    const triage = await findCharter("triage", wsRoot);
    expect(triage!.source).toBe("workspace");
    expect(triage!.description).toBe("PWAGENT VARIANT");
  });

  it("user override at ~/.pwagent/agents/ takes precedence over embedded", async () => {
    const userAgentsDir = join(home, "agents");
    await mkdir(userAgentsDir, { recursive: true });
    await writeFile(
      join(userAgentsDir, "heal.md"),
      [
        "---",
        "name: pwagent-heal",
        "description: USER OVERRIDE",
        "---",
        "",
        "user body",
        "",
      ].join("\n"),
      "utf8",
    );

    const { findCharter } = await import("../src/charters/loader.js");
    const heal = await findCharter("heal");
    expect(heal!.source).toBe("user");
    expect(heal!.description).toBe("USER OVERRIDE");
  });
});
