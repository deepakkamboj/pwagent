import { NextResponse } from "next/server";
import { getOrCreateSecret, isReadOnly } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Bootstrap endpoint — sets the HttpOnly session cookie that the page-side
 * Server Actions check. Loopback-only (enforced by middleware.ts). No-op in
 * --read-only mode since writes are disabled anyway.
 */
export async function POST() {
  if (isReadOnly()) {
    return NextResponse.json({ ok: true, readOnly: true });
  }
  const secret = getOrCreateSecret();
  const res = NextResponse.json({ ok: true });
  res.cookies.set("pwagent_session", secret, {
    httpOnly: true,
    sameSite: "strict",
    secure: false, // we're loopback-only; HTTPS isn't required
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}
