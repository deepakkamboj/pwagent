import { NextResponse } from "next/server";
import { listJobs, isSchedulerRunning } from "@/lib/jobs";

export const dynamic = "force-dynamic";

export async function GET() {
  const jobs = await listJobs();
  return NextResponse.json({
    jobs,
    schedulerRunning: isSchedulerRunning(),
    timestamp: new Date().toISOString(),
  });
}
