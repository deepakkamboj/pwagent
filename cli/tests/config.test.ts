import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTmpHome } from "./helpers/tmpHome.js";

describe("config loader", () => {
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    vi.resetModules(); // re-import so PWAGENT_HOME is re-read
    const t = await createTmpHome();
    cleanup = t.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  it("reports configExists=false on a fresh home", async () => {
    const { configExists } = await import("../src/config/loader.js");
    expect(await configExists()).toBe(false);
  });

  it("returns defaults when no config file is present", async () => {
    const { loadConfig } = await import("../src/config/loader.js");
    const cfg = await loadConfig();
    expect(cfg.provider.clientName).toBe("pwagent");
    expect(cfg.provider.model).toBe("claude-sonnet-4.5");
    expect(cfg.provider.logLevel).toBe("error");
    expect(cfg.tools.allowlist).toContain("bash");
  });

  it("persists and re-reads a saved config atomically", async () => {
    const { saveConfig, loadConfig, configExists } = await import("../src/config/loader.js");
    const { DEFAULT_CONFIG } = await import("../src/config/schema.js");

    const draft = structuredClone(DEFAULT_CONFIG);
    draft.provider.model = "claude-haiku-4.5";
    draft.ado.org = "https://dev.azure.com/contoso";
    await saveConfig(draft);

    expect(await configExists()).toBe(true);
    const reloaded = await loadConfig();
    expect(reloaded.provider.model).toBe("claude-haiku-4.5");
    expect(reloaded.ado.org).toBe("https://dev.azure.com/contoso");
  });

  it("rejects invalid logLevel via schema validation", async () => {
    const { saveConfig } = await import("../src/config/loader.js");
    const { DEFAULT_CONFIG } = await import("../src/config/schema.js");

    const bad = structuredClone(DEFAULT_CONFIG);
    // logLevel must be in the enum
    (bad.provider as unknown as { logLevel: string }).logLevel = "verbose";
    await expect(saveConfig(bad)).rejects.toThrow();
  });

  it("gets a value at a dotted path", async () => {
    const { saveConfig, getConfigValue } = await import("../src/config/loader.js");
    const { DEFAULT_CONFIG } = await import("../src/config/schema.js");
    await saveConfig(DEFAULT_CONFIG);
    expect(await getConfigValue("provider.clientName")).toBe("pwagent");
    expect(await getConfigValue("provider.nonexistent")).toBeUndefined();
    expect(await getConfigValue("not.a.real.path")).toBeUndefined();
  });

  it("sets a value at a dotted path and persists it", async () => {
    const { saveConfig, setConfigValue, getConfigValue } = await import("../src/config/loader.js");
    const { DEFAULT_CONFIG } = await import("../src/config/schema.js");
    await saveConfig(DEFAULT_CONFIG);

    await setConfigValue("provider.model", "claude-opus-4.5");
    expect(await getConfigValue("provider.model")).toBe("claude-opus-4.5");

    await setConfigValue("ado.project", "Engineering");
    expect(await getConfigValue("ado.project")).toBe("Engineering");
  });

  it("throws a readable error when setConfigValue violates schema", async () => {
    const { saveConfig, setConfigValue } = await import("../src/config/loader.js");
    const { DEFAULT_CONFIG } = await import("../src/config/schema.js");
    await saveConfig(DEFAULT_CONFIG);

    await expect(setConfigValue("provider.logLevel", "verbose")).rejects.toThrow(/logLevel|invalid|enum/i);
  });
});
