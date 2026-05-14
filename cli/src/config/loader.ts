import { z } from "zod";
import { ConfigSchema, DEFAULT_CONFIG, type Config } from "./schema.js";
import { paths } from "../utils/paths.js";
import { fileExists, readJson, writeJsonAtomic } from "../utils/files.js";

let cached: Config | undefined;

export async function loadConfig(): Promise<Config> {
  if (cached) return cached;
  if (!fileExists(paths.config)) {
    cached = DEFAULT_CONFIG;
    return cached;
  }
  const raw = await readJson(paths.config);
  cached = ConfigSchema.parse(raw);
  return cached;
}

export async function saveConfig(cfg: Config): Promise<void> {
  const validated = ConfigSchema.parse(cfg);
  await writeJsonAtomic(paths.config, validated);
  cached = validated;
}

export async function configExists(): Promise<boolean> {
  return fileExists(paths.config);
}

export function invalidateCache(): void {
  cached = undefined;
}

/**
 * Read a value at a dotted path, e.g. "provider.model" or "ado.org".
 * Returns undefined if any segment is missing.
 */
export async function getConfigValue(dottedPath: string): Promise<unknown> {
  const cfg = await loadConfig();
  return dottedPath.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, cfg);
}

/**
 * Set a value at a dotted path. Re-validates and persists.
 */
export async function setConfigValue(dottedPath: string, value: unknown): Promise<void> {
  const cfg = await loadConfig();
  const keys = dottedPath.split(".");
  const draft = structuredClone(cfg) as Record<string, unknown>;
  let cursor: Record<string, unknown> = draft;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]!;
    const next = cursor[key];
    if (next === undefined || next === null || typeof next !== "object") {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[keys[keys.length - 1]!] = value;
  try {
    await saveConfig(draft as unknown as Config);
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new Error(`invalid value for ${dottedPath}: ${err.errors[0]?.message ?? "validation failed"}`);
    }
    throw err;
  }
}
