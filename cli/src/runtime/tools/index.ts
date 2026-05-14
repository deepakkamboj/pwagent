import { bashTool } from "./bash.js";
import { editTool } from "./editFile.js";
import { grepTool } from "./grep.js";
import { readTool } from "./readFile.js";
import { writeTool } from "./writeFile.js";
import type { Tool, ToolContext } from "./types.js";

export type { Tool, ToolContext };

export const ALL_TOOLS: Tool[] = [readTool, writeTool, editTool, bashTool, grepTool];

/**
 * Filter the full tool set to the ones permitted by the current context's allowlist.
 * Used by the coordinator when wiring tools into a Copilot session.
 */
export function getTools(allowlist: ReadonlySet<string>): Tool[] {
  return ALL_TOOLS.filter((t) => allowlist.has(t.name));
}
