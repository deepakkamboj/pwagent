import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTmpHome } from "./helpers/tmpHome.js";

describe("skills loader", () => {
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

  it("loads embedded skills across multiple packs", async () => {
    const { loadSkills } = await import("../src/skills/loader.js");
    const { list } = await loadSkills();
    const packs = new Set(list.map((s) => s.pack));
    // v0.3 packs: core, ci, pom, playwright-cli, kusto, ado, a11y
    expect(packs.has("core")).toBe(true);
    expect(packs.has("ci")).toBe(true);
    expect(packs.has("pom")).toBe(true);
    expect(packs.has("playwright-cli")).toBe(true);
    expect(packs.has("kusto")).toBe(true);
    expect(packs.has("ado")).toBe(true);
    expect(packs.has("a11y")).toBe(true);
    expect(list.length).toBeGreaterThanOrEqual(50);
  });

  it("ids follow pack/name shape for nested skills", async () => {
    const { findSkill } = await import("../src/skills/loader.js");
    const locators = await findSkill("core/locators");
    expect(locators).toBeDefined();
    expect(locators!.pack).toBe("core");
    expect(locators!.name).toBe("locators");
  });

  it("derives a description from the first paragraph when frontmatter has none", async () => {
    const { findSkill } = await import("../src/skills/loader.js");
    const debugging = await findSkill("core/debugging");
    expect(debugging).toBeDefined();
    expect(debugging!.description.length).toBeGreaterThan(0);
  });

  it("workspace .squad/ skills override embedded skills with the same id", async () => {
    const wsSkill = join(home, ".squad", "skills", "core");
    await mkdir(wsSkill, { recursive: true });
    await writeFile(
      join(wsSkill, "locators.md"),
      [
        "---",
        "description: SQUAD WORKSPACE OVERRIDE — repo-specific locator rules",
        "---",
        "",
        "# locator overrides",
      ].join("\n"),
      "utf8",
    );

    const { findSkill } = await import("../src/skills/loader.js");
    const s = await findSkill("core/locators", home);
    expect(s!.source).toBe("workspace");
    expect(s!.description).toMatch(/SQUAD WORKSPACE OVERRIDE/);
  });

  it("Squad-shaped <name>/SKILL.md is recognized in a workspace dir", async () => {
    // Squad's `squad init` creates `.squad/skills/<name>/SKILL.md`
    const dir = join(home, ".squad", "skills", "my-custom");
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "SKILL.md"),
      [
        "---",
        "description: Squad-shaped skill in a workspace",
        "---",
        "",
        "# my-custom skill body",
      ].join("\n"),
      "utf8",
    );

    const { loadSkills, findSkill } = await import("../src/skills/loader.js");
    const { list } = await loadSkills(home);
    const ws = list.filter((s) => s.source === "workspace");
    expect(ws.some((s) => s.name === "my-custom")).toBe(true);

    // Root-depth Squad skill: directory name is both the pack and the id.
    const skill = await findSkill("my-custom", home);
    expect(skill).toBeDefined();
    expect(skill!.pack).toBe("my-custom");
    expect(skill!.description).toMatch(/Squad-shaped/);
  });

  it(".pwagent/ workspace dir wins over .squad/ for skills", async () => {
    const squadSkill = join(home, ".squad", "skills", "core");
    const pwagentSkill = join(home, ".pwagent", "skills", "core");
    await mkdir(squadSkill, { recursive: true });
    await mkdir(pwagentSkill, { recursive: true });
    await writeFile(
      join(squadSkill, "locators.md"),
      "---\ndescription: FROM_SQUAD\n---\nbody",
      "utf8",
    );
    await writeFile(
      join(pwagentSkill, "locators.md"),
      "---\ndescription: FROM_PWAGENT\n---\nbody",
      "utf8",
    );

    const { findSkill } = await import("../src/skills/loader.js");
    const s = await findSkill("core/locators", home);
    expect(s!.source).toBe("workspace");
    expect(s!.description).toBe("FROM_PWAGENT");
  });
});
