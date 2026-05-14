import { type NextRequest, NextResponse } from "next/server";
import { readAuditEvents } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * Audit export endpoint. Accepts the same filters as the audit page:
 *   ?since=7d&type=run.complete&agent=triage&search=...
 *   &format=jsonl|json
 *
 * Streams up to MAX_EVENTS as Content-Disposition: attachment. No write side
 * effects — safe to expose without bearer auth (PT5 will still gate it).
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const since = url.searchParams.get("since") ?? "30d";
  const type = url.searchParams.get("type") ?? undefined;
  const agent = url.searchParams.get("agent") ?? undefined;
  const search = url.searchParams.get("search") ?? undefined;
  const format = (url.searchParams.get("format") ?? "jsonl") as "jsonl" | "json";

  const events = readAuditEvents({ since, type, agent, search });

  if (format === "json") {
    const body = JSON.stringify(events, null, 2);
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="pwagent-audit-${Date.now()}.json"`,
      },
    });
  }

  const body = events.map((e) => JSON.stringify(e)).join("\n") + (events.length ? "\n" : "");
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Content-Disposition": `attachment; filename="pwagent-audit-${Date.now()}.jsonl"`,
    },
  });
}
