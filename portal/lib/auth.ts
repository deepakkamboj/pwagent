import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import { portalPaths } from "./paths";

const SECRET_PATH = join(portalPaths.home, "portal", "secret");

/**
 * Read the per-install bearer secret. Generates one on first call. The file
 * is chmod 600 so other local users can't read it on POSIX. On Windows the
 * filesystem ACL on the user-home tree provides equivalent protection.
 */
export function getOrCreateSecret(): string {
  if (existsSync(SECRET_PATH)) {
    try {
      const raw = readFileSync(SECRET_PATH, "utf8").trim();
      if (raw.length >= 32) return raw;
    } catch {
      /* fall through and regenerate */
    }
  }
  const secret = randomBytes(32).toString("hex");
  mkdirSync(dirname(SECRET_PATH), { recursive: true });
  writeFileSync(SECRET_PATH, secret + "\n", { encoding: "utf8" });
  try {
    chmodSync(SECRET_PATH, 0o600);
  } catch {
    /* chmod not meaningful on Windows */
  }
  return secret;
}

export function getSecretPath(): string {
  return SECRET_PATH;
}

/**
 * Returns true when the request is allowed to perform write actions:
 *   - portal is NOT in read-only mode
 *   - the bearer token in the cookie OR Authorization header matches
 *
 * In v1 we accept the cookie set by the layout (HttpOnly, set on first load
 * from a loopback origin), so the user doesn't have to type the token.
 */
export function isWriteAuthorized(opts: { cookieToken?: string; headerToken?: string; readOnly: boolean }): boolean {
  if (opts.readOnly) return false;
  const expected = getOrCreateSecret();
  return opts.cookieToken === expected || opts.headerToken === expected;
}

export function isReadOnly(): boolean {
  return process.env["PWAGENT_PORTAL_READ_ONLY"] === "1" || process.env["PWAGENT_PORTAL_READ_ONLY"] === "true";
}
