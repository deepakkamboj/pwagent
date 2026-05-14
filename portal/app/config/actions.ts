"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { readConfig, writeConfig, diffConfigs, type DiffLine, type PwagentConfig } from "@/lib/config";
import { isReadOnly, isWriteAuthorized } from "@/lib/auth";

const KNOWN_LOG_LEVELS = ["error", "warn", "info", "debug"] as const;

async function requireWriteAuth(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (isReadOnly()) return { ok: false, error: "portal is in --read-only mode" };
  const store = await cookies();
  const cookieToken = store.get("pwagent_session")?.value;
  if (!isWriteAuthorized({ cookieToken, readOnly: false })) {
    return { ok: false, error: "unauthorized — refresh the page to pick up the session cookie" };
  }
  return { ok: true };
}

export interface PreviewResult {
  ok: boolean;
  error?: string;
  diff?: DiffLine[];
  /** Echoes the validated next-config so the client can show "after" alongside the diff. */
  next?: PwagentConfig;
}

export async function previewConfig(formPatch: Record<string, string>): Promise<PreviewResult> {
  // preview itself is read-only (no disk write), but we still check auth so
  // an unauthenticated visitor can't probe the disk shape via diff output.
  const auth = await requireWriteAuth();
  if (!auth.ok) return { ok: false, error: auth.error };
  const current = readConfig() ?? {};
  const next = applyFormPatch(structuredClone(current), formPatch);
  const validation = validate(next);
  if (!validation.ok) return { ok: false, error: validation.error };
  const diff = diffConfigs(current, next);
  return { ok: true, diff, next };
}

export interface SaveResult {
  ok: boolean;
  error?: string;
  /** Number of lines actually changed (excluding "context"). Caller can show "saved N changes". */
  changed?: number;
}

export async function saveConfig(formPatch: Record<string, string>): Promise<SaveResult> {
  const auth = await requireWriteAuth();
  if (!auth.ok) return { ok: false, error: auth.error };
  const current = readConfig() ?? {};
  const next = applyFormPatch(structuredClone(current), formPatch);
  const validation = validate(next);
  if (!validation.ok) return { ok: false, error: validation.error };
  const diff = diffConfigs(current, next);
  const changed = diff.filter((d) => d.type !== "context").length;
  if (changed === 0) return { ok: true, changed: 0 };
  try {
    writeConfig(next);
    revalidatePath("/config");
    return { ok: true, changed };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── helpers ──────────────────────────────────────────────────────────────

function applyFormPatch(cfg: PwagentConfig, patch: Record<string, string>): PwagentConfig {
  cfg.provider ??= {};
  cfg.ado ??= {};
  cfg.audit ??= {};

  if (patch["provider.clientName"] !== undefined) cfg.provider.clientName = patch["provider.clientName"];
  if (patch["provider.model"] !== undefined) cfg.provider.model = patch["provider.model"];
  if (patch["provider.logLevel"] !== undefined) {
    const v = patch["provider.logLevel"] as (typeof KNOWN_LOG_LEVELS)[number];
    cfg.provider.logLevel = v;
  }
  if (patch["ado.org"] !== undefined) cfg.ado.org = patch["ado.org"];
  if (patch["ado.project"] !== undefined) cfg.ado.project = patch["ado.project"];
  if (patch["ado.defaultRepo"] !== undefined) cfg.ado.defaultRepo = patch["ado.defaultRepo"];
  if (patch["audit.enabled"] !== undefined) cfg.audit.enabled = patch["audit.enabled"] === "true";
  if (patch["audit.path"] !== undefined) cfg.audit.path = patch["audit.path"];
  if (patch["defaultSurface"] !== undefined) cfg.defaultSurface = patch["defaultSurface"];

  return cfg;
}

function validate(cfg: PwagentConfig): { ok: true } | { ok: false; error: string } {
  if (cfg.provider?.logLevel && !KNOWN_LOG_LEVELS.includes(cfg.provider.logLevel)) {
    return { ok: false, error: `provider.logLevel must be one of: ${KNOWN_LOG_LEVELS.join(", ")}` };
  }
  if (cfg.provider?.clientName !== undefined && cfg.provider.clientName.length === 0) {
    return { ok: false, error: "provider.clientName cannot be empty" };
  }
  if (cfg.provider?.model !== undefined && cfg.provider.model.length === 0) {
    return { ok: false, error: "provider.model cannot be empty" };
  }
  if (cfg.defaultSurface && !["cli", "chat", "either", "noop"].includes(cfg.defaultSurface)) {
    return { ok: false, error: `defaultSurface must be one of: cli, chat, either, noop` };
  }
  return { ok: true };
}
