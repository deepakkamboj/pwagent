"use server";

import { spawn } from "node:child_process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { portalPaths } from "@/lib/paths";
import { isReadOnly, isWriteAuthorized } from "@/lib/auth";

const execFileAsync = promisify(execFile);

async function requireWriteAuth(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (isReadOnly()) return { ok: false, error: "portal is in --read-only mode" };
  const store = await cookies();
  const cookieToken = store.get("pwagent_session")?.value;
  if (!isWriteAuthorized({ cookieToken, readOnly: false })) {
    return { ok: false, error: "unauthorized — refresh the page to pick up the session cookie" };
  }
  return { ok: true };
}

function locatePwagentBinary(): { cmd: string; preArgs: string[] } | undefined {
  const candidates = [
    join(process.cwd(), "..", "cli", "dist", "index.js"),
    join(process.cwd(), "..", "dist", "index.js"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return { cmd: "node", preArgs: [c] };
  }
  // Fall back to global pwagent if no local dist is present.
  return { cmd: "pwagent", preArgs: [] };
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    return code === "EPERM";
  }
}

function readPid(): number | undefined {
  if (!existsSync(portalPaths.schedulerPid)) return undefined;
  try {
    const data = JSON.parse(readFileSync(portalPaths.schedulerPid, "utf8")) as { pid?: number };
    return data.pid;
  } catch {
    return undefined;
  }
}

export async function startScheduler(): Promise<{ ok: boolean; error?: string; message?: string }> {
  const auth = await requireWriteAuth();
  if (!auth.ok) return auth;

  const existing = readPid();
  if (existing && isPidAlive(existing)) {
    return { ok: false, error: `scheduler already running (pid ${existing})` };
  }

  const bin = locatePwagentBinary();
  if (!bin) return { ok: false, error: "could not locate pwagent binary" };

  // Detached spawn so the scheduler outlives this Server Action.
  // stdio: 'ignore' detaches from the parent's stdio so the child runs free.
  try {
    const child = spawn(bin.cmd, [...bin.preArgs, "scheduler", "start"], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();

    // Give the scheduler ~1s to write its PID file before we report success.
    await new Promise((r) => setTimeout(r, 1500));
    const pid = readPid();
    if (!pid) {
      return {
        ok: false,
        error: "scheduler did not register a PID within 1.5s — check ~/.pwagent/logs/scheduler/",
      };
    }
    revalidatePath("/scheduler");
    revalidatePath("/jobs");
    return { ok: true, message: `scheduler started (pid ${pid})` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function stopScheduler(): Promise<{ ok: boolean; error?: string; message?: string }> {
  const auth = await requireWriteAuth();
  if (!auth.ok) return auth;

  const bin = locatePwagentBinary();
  if (!bin) return { ok: false, error: "could not locate pwagent binary" };

  try {
    const { stdout, stderr } = await execFileAsync(bin.cmd, [...bin.preArgs, "scheduler", "stop"], {
      timeout: 30_000,
    });
    const output = (stdout + "\n" + stderr).trim();
    revalidatePath("/scheduler");
    revalidatePath("/jobs");
    return { ok: true, message: output || "scheduler stopped" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message.split("\n")[0] : String(err) };
  }
}
