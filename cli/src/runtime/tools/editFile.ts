import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Tool } from "./types.js";

export const editTool: Tool = {
  name: "edit",
  description: "Replace exactly one occurrence of `oldString` with `newString` in the file. Fails if `oldString` is missing or appears more than once — pass more context to make it unique.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string" },
      oldString: { type: "string" },
      newString: { type: "string" },
    },
    required: ["path", "oldString", "newString"],
    additionalProperties: false,
  },
  async run(args, ctx) {
    const a = (args as { path?: string; oldString?: string; newString?: string }) ?? {};
    if (!a.path || a.oldString === undefined || a.newString === undefined) {
      throw new Error("edit: path, oldString, newString are required");
    }
    if (a.oldString === a.newString) {
      throw new Error("edit: oldString and newString are identical — nothing to change");
    }
    const full = resolve(ctx.cwd, a.path);
    const content = await readFile(full, "utf8");
    const occurrences = countOccurrences(content, a.oldString);
    if (occurrences === 0) throw new Error(`edit: oldString not found in ${a.path}`);
    if (occurrences > 1) throw new Error(`edit: oldString matches ${occurrences} times in ${a.path} — provide more context`);
    const next = content.replace(a.oldString, a.newString);
    await writeFile(full, next, "utf8");
    return { path: full, bytes: Buffer.byteLength(next, "utf8") };
  },
};

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count += 1;
    idx += needle.length;
  }
  return count;
}
