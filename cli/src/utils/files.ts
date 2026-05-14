import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function readJson<T = unknown>(path: string): Promise<T> {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as T;
}

/**
 * Atomic JSON write: write to tmp file, fsync, rename.
 * Prevents partial-write corruption if the process dies mid-write.
 */
export async function writeJsonAtomic(path: string, data: unknown): Promise<void> {
  await ensureDir(dirname(path));
  const tmp = join(dirname(path), `.${Date.now()}.${process.pid}.tmp`);
  await writeFile(tmp, JSON.stringify(data, null, 2) + "\n", { encoding: "utf8" });
  await rename(tmp, path);
}

export function fileExists(path: string): boolean {
  return existsSync(path);
}

export async function readText(path: string): Promise<string> {
  return readFile(path, "utf8");
}

export async function writeText(path: string, content: string): Promise<void> {
  await ensureDir(dirname(path));
  await writeFile(path, content, { encoding: "utf8" });
}
