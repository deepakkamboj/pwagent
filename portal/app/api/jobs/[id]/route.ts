import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getJob } from "@/lib/jobs";
import { portalPaths } from "@/lib/paths";

export const dynamic = "force-dynamic";

interface LifecycleEvent {
  type: string;
  jobId: string;
  runId: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "not_found", id }, { status: 404 });

  const eventsPath = join(portalPaths.schedulerEvents, `${id}.jsonl`);
  const events: LifecycleEvent[] = [];
  if (existsSync(eventsPath)) {
    try {
      const raw = readFileSync(eventsPath, "utf8");
      const lines = raw.split("\n").filter((l) => l.trim()).slice(-50);
      for (const l of lines) {
        try {
          events.push(JSON.parse(l) as LifecycleEvent);
        } catch {
          /* skip */
        }
      }
    } catch {
      /* ignore */
    }
  }
  return NextResponse.json({ job, events });
}
