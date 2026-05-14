export interface ToolContext {
  /** Working directory for relative paths. Set by the runtime per invocation. */
  cwd: string;
  /** Hard wall-clock timeout for the whole agent run, in ms epoch. Tools should bail if exceeded. */
  deadlineMs?: number;
  /** Allowlist of tool names the current agent may call. */
  allowlist: ReadonlySet<string>;
}

export interface Tool {
  name: string;
  description: string;
  /** JSON Schema for the tool's input. */
  inputSchema: Record<string, unknown>;
  run(args: unknown, ctx: ToolContext): Promise<unknown>;
}
