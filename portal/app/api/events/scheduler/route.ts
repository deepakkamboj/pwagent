import { existsSync, statSync, openSync, readSync, closeSync, watch } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { portalPaths } from "@/lib/paths";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Combined SSE stream — watches every JSONL file under ~/.pwagent/scheduler/events/
 * and streams new lines as they arrive. Each emitted line is the raw JSONL
 * entry with a `job` field added (the filename minus `.jsonl`).
 *
 * Client side: new EventSource('/api/events/scheduler'); listen for 'message'.
 */
export async function GET() {
  const dir = portalPaths.schedulerEvents;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const offsets = new Map<string, number>();
      let closed = false;
      const watchers: Array<{ close: () => void }> = [];

      const send = (data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          /* downstream closed */
        }
      };
      const heartbeat = () => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(":\n\n"));
        } catch {
          /* downstream closed */
        }
      };

      const readNew = (jobId: string, file: string) => {
        if (!existsSync(file)) return;
        const size = statSync(file).size;
        const prev = offsets.get(file) ?? 0;
        if (size <= prev) {
          if (size < prev) offsets.set(file, 0); // rotated
          return;
        }
        const fd = openSync(file, "r");
        try {
          const buf = Buffer.alloc(size - prev);
          readSync(fd, buf, 0, buf.length, prev);
          offsets.set(file, size);
          for (const raw of buf.toString("utf8").split("\n")) {
            if (!raw.trim()) continue;
            try {
              const parsed = JSON.parse(raw) as Record<string, unknown>;
              send({ ...parsed, job: jobId });
            } catch {
              send({ job: jobId, raw });
            }
          }
        } finally {
          closeSync(fd);
        }
      };

      // Seed: replay tail of every existing file (last ~10 events each).
      if (existsSync(dir)) {
        try {
          const files = (await readdir(dir)).filter((f) => f.endsWith(".jsonl"));
          for (const f of files) {
            const file = join(dir, f);
            const jobId = f.replace(/\.jsonl$/, "");
            try {
              const size = statSync(file).size;
              const tailSize = Math.min(size, 8_192);
              const fd = openSync(file, "r");
              try {
                const buf = Buffer.alloc(tailSize);
                readSync(fd, buf, 0, tailSize, size - tailSize);
                const lines = buf.toString("utf8").split("\n").filter(Boolean).slice(-10);
                for (const raw of lines) {
                  try {
                    const parsed = JSON.parse(raw) as Record<string, unknown>;
                    send({ ...parsed, job: jobId });
                  } catch {
                    send({ job: jobId, raw });
                  }
                }
              } finally {
                closeSync(fd);
              }
              offsets.set(file, size);
            } catch {
              /* skip unreadable file */
            }
          }
        } catch {
          /* dir might not exist yet */
        }
      }

      // Watch each existing file for appends, plus the directory for new files.
      const attachFileWatcher = (file: string, jobId: string) => {
        try {
          const w = watch(file, () => readNew(jobId, file));
          watchers.push({ close: () => w.close() });
        } catch {
          /* file might disappear */
        }
      };
      if (existsSync(dir)) {
        try {
          const files = (await readdir(dir)).filter((f) => f.endsWith(".jsonl"));
          for (const f of files) attachFileWatcher(join(dir, f), f.replace(/\.jsonl$/, ""));
        } catch {
          /* skip */
        }
        try {
          const dirWatcher = watch(dir, (_event, filename) => {
            if (!filename || !filename.endsWith(".jsonl")) return;
            const file = join(dir, filename);
            const jobId = filename.replace(/\.jsonl$/, "");
            if (!offsets.has(file) && existsSync(file)) {
              offsets.set(file, 0);
              attachFileWatcher(file, jobId);
              readNew(jobId, file);
            } else if (offsets.has(file)) {
              readNew(jobId, file);
            }
          });
          watchers.push({ close: () => dirWatcher.close() });
        } catch {
          /* skip */
        }
      }

      // Keep-alive every 25s so reverse proxies / browser timeouts don't kill us.
      const hb = setInterval(heartbeat, 25_000);

      // Tear down when the client disconnects.
      const cleanup = () => {
        closed = true;
        clearInterval(hb);
        for (const w of watchers) {
          try {
            w.close();
          } catch {
            /* ignore */
          }
        }
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      };

      // Signal disconnect via the abort signal if the runtime supports it.
      // (Next.js doesn't currently surface it on Request inside this scope —
      //  the controller will throw on enqueue when the client disconnects,
      //  and our send()/heartbeat() handlers swallow that gracefully.)
      void cleanup;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}
