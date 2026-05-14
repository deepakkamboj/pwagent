import { execa } from "execa";
import type { Prereq } from "./matrix.js";

export interface DetectResult {
  installed: boolean;
  version?: string;
  raw?: string;
  error?: string;
}

const cache = new Map<string, DetectResult>();

export async function detect(prereq: Prereq): Promise<DetectResult> {
  const cached = cache.get(prereq.id);
  if (cached) return cached;

  const result = await runDetection(prereq);
  cache.set(prereq.id, result);
  return result;
}

export function clearDetectionCache(): void {
  cache.clear();
}

// Prereqs that require a minimum version. The detector parses the captured group
// from `versionPattern` and rejects if it's below the floor. Used today for
// node — @github/copilot-sdk requires Node 22+ (uses built-in node:sqlite).
const MIN_VERSIONS: Record<string, number> = {
  node: 22,
};

async function runDetection(prereq: Prereq): Promise<DetectResult> {
  const d = prereq.detect;

  if (d.kind === "gh-ext") {
    return detectGhExtension(d.name);
  }

  try {
    const res = await execa(d.cmd, d.args, { timeout: 10_000, reject: false });
    const out = `${res.stdout}\n${res.stderr}`.trim();
    const version = d.versionPattern ? extractVersion(out, d.versionPattern) : undefined;

    // Some CLIs print the version and exit non-zero (e.g. `npx playwright --version`
    // on first run, where the unscoped deprecation shim emits the version then exits 1).
    // If the regex matched, trust it over the exit code.
    const exitOk = !res.failed && res.exitCode === 0;
    if (!exitOk && !version) {
      return { installed: false, error: short(res.stderr || res.stdout) };
    }

    const minMajor = MIN_VERSIONS[prereq.id];
    if (minMajor !== undefined && version !== undefined) {
      const major = parseInt(version.split(".")[0] ?? "0", 10);
      if (Number.isFinite(major) && major < minMajor) {
        return {
          installed: false,
          version,
          raw: out,
          error: `version ${version} below minimum ${minMajor}`,
        };
      }
    }

    return { installed: true, version, raw: out };
  } catch (err: unknown) {
    return { installed: false, error: short(err) };
  }
}

async function detectGhExtension(name: string): Promise<DetectResult> {
  try {
    const res = await execa("gh", ["extension", "list"], { timeout: 10_000, reject: false });
    if (res.failed || res.exitCode !== 0) {
      return { installed: false, error: "gh not installed" };
    }
    const installed = res.stdout.split("\n").some((line) => line.includes(name));
    return { installed };
  } catch (err: unknown) {
    return { installed: false, error: short(err) };
  }
}

function extractVersion(text: string, pattern: RegExp): string | undefined {
  const m = pattern.exec(text);
  return m?.[1];
}

function short(err: unknown): string {
  if (!err) return "unknown error";
  if (typeof err === "string") return err.split("\n")[0]?.slice(0, 80) ?? "";
  if (err instanceof Error) return err.message.split("\n")[0]?.slice(0, 80) ?? "";
  return String(err).slice(0, 80);
}
