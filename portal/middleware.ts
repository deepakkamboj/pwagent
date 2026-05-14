import { NextResponse, type NextRequest } from "next/server";

/**
 * Loopback-only enforcement. By default the portal binds to 127.0.0.1, but
 * we don't trust the bind alone — a misconfigured reverse-proxy or a future
 * `--bind 0.0.0.0` user override should not break our invariants.
 *
 * Policy:
 *   1. PWAGENT_PORTAL_BIND_ALL=1 → allow everything (operator opt-in).
 *   2. Host header is loopback → allow. X-Forwarded-* headers on loopback are
 *      spurious noise added by corporate proxies / browser extensions / dev
 *      tools (e.g. ZScaler, PaloAlto, the Dynamics interceptor). They don't
 *      represent a public origin, so we don't reject on them.
 *   3. Host header is NOT loopback → reject unless the operator explicitly
 *      opted in via the env var. X-Forwarded-* on a public host is also a
 *      reject because we don't know who set them.
 */
export function middleware(req: NextRequest) {
  const allowAll = process.env["PWAGENT_PORTAL_BIND_ALL"] === "1";
  if (allowAll) return NextResponse.next();

  const hostHeader = req.headers.get("host") ?? "";
  const isLoopbackHost =
    hostHeader.startsWith("127.0.0.1") ||
    hostHeader.startsWith("localhost") ||
    hostHeader.startsWith("[::1]");

  if (isLoopbackHost) {
    return NextResponse.next();
  }

  return new NextResponse(
    "loopback only — open http://127.0.0.1:7337 or http://localhost:7337, " +
      "or set PWAGENT_PORTAL_BIND_ALL=1 to override (only behind a trusted proxy).",
    {
      status: 403,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    },
  );
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
