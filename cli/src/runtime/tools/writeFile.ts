import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { Tool } from "./types.js";

export const writeTool: Tool = {
  name: "write",
  description: "Create or overwrite a text file at the given path. Creates parent directories as needed. Returns bytes written.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string" },
      content: { type: "string" },
    },
    required: ["path", "content"],
    additionalProperties: false,
  },
  async run(args, ctx) {
    const a = (args as { path?: string; content?: string }) ?? {};
    if (!a.path) throw new Error("write: 'path' is required");
    if (typeof a.content !== "string") throw new Error("write: 'content' must be a string");
    const full = resolve(ctx.cwd, a.path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, a.content, "utf8");
    return { path: full, bytes: Buffer.byteLength(a.content, "utf8") };
  },
};
