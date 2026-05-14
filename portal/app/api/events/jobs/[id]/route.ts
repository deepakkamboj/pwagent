import { existsSync, statSync, openSync, readSync, closeSync } from "node:fs";
import { watch as fsWatch } from "node:fs";
import { join } from "node:path";
import { portalPaths } from "@/lib/paths";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Server-Sent Events stream — tails the JSONL event log for a specific job.
 * Replays the last 20 events on connect, then watches the file for appends.
 *
 * Client side: new EventSource('/api/events/jobs/<id>'); listen for 'message'.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const filename = join(portalPaths.schedulerEvents, `${id}.jsonl`);

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let offset = 0;

      const sendLine = (line: string) => {
        if (!line.trim()) return;
        controller.enqueue(encoder.encode(`data: ${line}\n\n`));
      };

      const readFromOffset = () => {
        if (!existsSync(filename)) return;
        const size = statSync(filename).size;
        if (size <= offset) {
          if (size < offset) offset = 0; // file was rotated / truncated
          return;
        }
        const fd = openSync(filename, "r");
        try {
          const buf = Buffer.alloc(size - offset);
          readSync(fd, buf, 0, buf.length, offset);
          offset = size;
          const chunk = buf.toString("utf8");
          for (const line of chunk.split("\n")) sendLine(line);
        } finally {
          closeSync(fd);
        }
      };

      // Replay the last 20 events from the tail.
      if (existsSync(filename)) {
        try {
          const size = statSync(filename).size;
          const tailSize = Math.min(size, 16_384);
          const fd = openSync(filename, "r");
          try {
            const buf = Buffer.alloc(tailSize);
            readSync(fd, buf, 0, tailSize, size - tailSize);
            const lines = buf.toString("utf8").split("\n").filter(Boolean).slice(-20);
            for (const l of lines) sendLine(l);
          } finally {
            closeSync(fd);
          }
          offset = size;
        } catch {
          /* file went missing between exists() and stat() — ignore */
        }
      } else {
        controller.enqueue(encoder.encode(`event: ready\ndata: {"empty":true}\n\n`));
      }

      // Watch the directory for new appends. fs.watch fires on the parent.
      let watcher: ReturnType<typeof fsWatch> | undefined;
      try {
        watcher = fsWatch(portalPaths.schedulerEvents, (_event, fname) => {
          if (fname === `${id}.jsonl`) readFromOffset();
        });
      } catch {
        /* dir may not exist yet */
      }

      // Heartbeat to keep the connection alive through proxies.
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`: heartbeat\n\n`));
      }, 25_000);

      (controller as unknown as { _cleanup?: () => void })._cleanup = () => {
        clearInterval(heartbeat);
        if (watcher) watcher.close();
      };
    },
    cancel() {
      // ReadableStream cancel — caller has disconnected.
      const c = this as unknown as { _cleanup?: () => void };
      c._cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
