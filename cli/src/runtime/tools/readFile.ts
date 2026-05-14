import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { Tool } from "./types.js";

const MAX_BYTES = 1_000_000; // 1 MB read cap

export const readTool: Tool = {
  name: "read",
  description: "Read a UTF-8 text file from the local filesystem. Path is resolved against the agent's working directory. Returns content; caps at 1 MB.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Absolute or workspace-relative path." },
    },
    required: ["path"],
    additionalProperties: false,
  },
  async run(args, ctx) {
    const arg = (args as { path?: string })?.path;
    if (!arg) throw new Error("read: 'path' is required");
    const full = resolve(ctx.cwd, arg);
    const s = await stat(full);
    if (s.size > MAX_BYTES) {
      return { content: "", truncated: true, sizeBytes: s.size, reason: "file exceeds 1 MB cap" };
    }
    const content = await readFile(full, "utf8");
    return { content, sizeBytes: s.size };
  },
};
