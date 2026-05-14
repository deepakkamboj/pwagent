import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Allocate an isolated PWAGENT_HOME for a test so config/loader writes don't
 * touch the user's real ~/.pwagent. Caller must invoke the returned cleanup.
 *
 * NOTE: the loader module caches paths at import time. Tests that exercise
 * the loader directly must `vi.resetModules()` between cases — see
 * tests/config.test.ts for the pattern.
 */
export async function createTmpHome(): Promise<{ home: string; cleanup: () => Promise<void> }> {
  const home = await mkdtemp(join(tmpdir(), "pwagent-test-"));
  process.env["PWAGENT_HOME"] = home;
  return {
    home,
    cleanup: async () => {
      delete process.env["PWAGENT_HOME"];
      await rm(home, { recursive: true, force: true });
    },
  };
}
