"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { readConfig, writeConfig, type PwagentConfig } from "@/lib/config";
import { isReadOnly, isWriteAuthorized } from "@/lib/auth";

type RepoEntry = NonNullable<PwagentConfig["repos"]>[number];

async function requireWriteAuth(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (isReadOnly()) return { ok: false, error: "portal is in --read-only mode" };
  const store = await cookies();
  const cookieToken = store.get("pwagent_session")?.value;
  if (!isWriteAuthorized({ cookieToken, readOnly: false })) {
    return { ok: false, error: "unauthorized — refresh the page to pick up the session cookie" };
  }
  return { ok: true };
}

function validateRepos(repos: RepoEntry[]): string | undefined {
  const seen = new Set<string>();
  for (const r of repos) {
    if (!r.name?.trim()) return "every repo needs a name";
    if (seen.has(r.name)) return `duplicate repo name: ${r.name}`;
    seen.add(r.name);
    if (!r.path?.trim()) return `repo '${r.name}' needs a path`;
    if (r.type !== "ado" && r.type !== "github") return `repo '${r.name}' type must be 'ado' or 'github'`;
    if (!r.defaultBranch?.trim()) return `repo '${r.name}' needs a defaultBranch`;
  }
  return undefined;
}

export async function saveRepos(repos: RepoEntry[]): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireWriteAuth();
  if (!auth.ok) return auth;

  const validationError = validateRepos(repos);
  if (validationError) return { ok: false, error: validationError };

  const cfg = readConfig() ?? {};
  const next: PwagentConfig = { ...cfg, repos };
  try {
    writeConfig(next);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  revalidatePath("/config");
  return { ok: true };
}
