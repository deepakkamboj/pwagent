/**
 * GitHub Copilot SDK provider adapter.
 *
 * The SDK lifecycle:
 *   1. const client = new CopilotClient({ autoStart: true, logLevel: "error" })
 *   2. await client.start()
 *   3. const session = await client.createSession({ clientName, model, systemMessage: { mode: "replace", content }, tools, streaming: true })
 *   4. session.on("assistant.message_delta", e => ...)
 *      session.on("session.idle", () => ...)
 *      session.on("session.error", e => ...)
 *   5. await session.send({ prompt })
 *   6. await session.disconnect()
 *
 * We isolate the SDK import behind a dynamic `import()` so:
 *   - tests can run without the SDK installed in the environment
 *   - missing-auth errors surface late with a clear message instead of a startup crash
 */

import type { Tool, ToolContext } from "./tools/index.js";

export interface ProviderSessionEvents {
  onDelta?: (chunk: string) => void;
  onToolStart?: (name: string) => void;
  onToolEnd?: (name: string, ok: boolean) => void;
  onError?: (msg: string) => void;
}

export interface ProviderSessionConfig {
  systemPrompt: string;
  prompt: string;
  model: string;
  clientName: string;
  tools: Tool[];
  toolContext: ToolContext;
  events?: ProviderSessionEvents;
  /** Optional idle timeout in ms; defaults to 600s. */
  idleTimeoutMs?: number;
  /** SDK connect timeout in ms; defaults to 20s. Without this, a stuck client.start() hangs the whole run. */
  connectTimeoutMs?: number;
  /** Print SDK init progress + raise SDK log level to "debug". */
  debug?: boolean;
  /** Lifecycle markers ("loading sdk", "connecting", "session created") for the CLI to render. */
  onProgress?: (stage: string) => void;
}

export interface ProviderResult {
  fullText: string;
  toolCalls: { name: string; ok: boolean }[];
  durationMs: number;
}

let cachedClient: unknown | undefined;
let cachedClientLogLevel: "error" | "warn" | "info" | "debug" | undefined;

async function getClient(logLevel: "error" | "warn" | "info" | "debug" = "error"): Promise<unknown> {
  // If the log level changed (e.g. --debug was passed on a subsequent call), rebuild.
  if (cachedClient && cachedClientLogLevel === logLevel) return cachedClient;
  const sdk = (await import("@github/copilot-sdk").catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `failed to load @github/copilot-sdk — is it installed? Run 'npm install' in the pwagent dir. (${msg})`,
    );
  })) as { CopilotClient: new (opts: unknown) => unknown };
  cachedClient = new sdk.CopilotClient({ autoStart: false, logLevel });
  cachedClientLogLevel = logLevel;
  return cachedClient;
}

/** Map an SDK / auth failure message to an actionable hint. */
function actionableHint(rawMessage: string): string | undefined {
  const m = rawMessage.toLowerCase();
  if (m.includes("copilot cli not installed") || m.includes("gh copilot")) {
    return "install the Copilot CLI: `winget install GitHub.cli.copilot` or `gh extension install github/gh-copilot`";
  }
  if (m.includes("scope") || m.includes("permission") || m.includes("forbidden")) {
    return "your gh token may lack the copilot scope. Run: `gh auth refresh -h github.com -s copilot`";
  }
  if (
    m.includes("auth") ||
    m.includes("token") ||
    m.includes("login") ||
    m.includes("not signed in") ||
    m.includes("unauthor")
  ) {
    return "authenticate with: `pwagent login` (wraps `gh auth login --web`)";
  }
  if (m.includes("subscription") || m.includes("copilot")) {
    return "this GitHub account may not have an active Copilot subscription. Check at https://github.com/settings/copilot";
  }
  if (m.includes("etimedout") || m.includes("econnrefused") || m.includes("network")) {
    return "network reachability to api.githubcopilot.com may be blocked. Check corporate proxy / VPN.";
  }
  return undefined;
}

export interface ReachabilityResult {
  reachable: boolean;
  /** Short status for doctor output. */
  status: "ok" | "sdk-missing" | "auth-missing" | "unknown";
  /** SDK state at the moment of the probe (e.g. "connected", "disconnected"). */
  state?: string;
  /** Round-trip duration in ms. */
  durationMs: number;
  /** Short message suitable for terminal display. */
  message: string;
}

/**
 * Probe the Copilot SDK without making a model call. Imports the SDK, instantiates
 * the client, optionally calls `start()`, reports the resulting state, then stops.
 *
 * Designed for `pwagent doctor`: reachable=true only when we both load the SDK
 * AND reach the connected state. Failure modes are categorised so the caller
 * can print a useful next-step hint.
 */
export async function probeCopilotReachable(timeoutMs = 5_000): Promise<ReachabilityResult> {
  const started = Date.now();

  let sdkExports: { CopilotClient: new (opts: unknown) => unknown };
  try {
    sdkExports = (await import("@github/copilot-sdk")) as typeof sdkExports;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      reachable: false,
      status: "sdk-missing",
      durationMs: Date.now() - started,
      message: `@github/copilot-sdk import failed: ${msg.split("\n")[0]}`,
    };
  }

  const client = new sdkExports.CopilotClient({ autoStart: false, logLevel: "error" }) as {
    start?(): Promise<void>;
    stop?(): Promise<{ message: string }[]>;
    getState?(): string;
  };

  // Always tear the SDK down before returning, in both success and failure paths.
  // Why: a partially-started client leaves the spawned copilot subprocess and node:sqlite
  // handle on the event loop, so the host process (e.g. `pwagent doctor`) won't exit.
  const cleanup = async (): Promise<void> => {
    if (typeof client.stop === "function") {
      try {
        await client.stop();
      } catch {
        /* ignore */
      }
    }
  };

  try {
    const initialState = typeof client.getState === "function" ? client.getState() : undefined;

    if (typeof client.start === "function" && initialState !== "connected") {
      const startPromise = client.start();
      let timer: NodeJS.Timeout | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`probe timed out after ${timeoutMs}ms`)), timeoutMs);
      });
      try {
        await Promise.race([startPromise, timeoutPromise]);
      } finally {
        if (timer) clearTimeout(timer);
        // Swallow any later rejection of the orphaned start() so it doesn't surface as unhandled.
        startPromise.catch(() => {});
      }
    }

    const finalState = typeof client.getState === "function" ? client.getState() : "unknown";
    await cleanup();

    return {
      reachable: finalState === "connected",
      status: finalState === "connected" ? "ok" : "unknown",
      state: finalState,
      durationMs: Date.now() - started,
      message:
        finalState === "connected"
          ? "Copilot SDK reachable"
          : `SDK loaded but state=${finalState} (try \`pwagent login\`)`,
    };
  } catch (err: unknown) {
    await cleanup();
    const msg = err instanceof Error ? err.message : String(err);
    const lower = msg.toLowerCase();
    // SDK depends on node:sqlite which is only unflagged in Node 22+.
    // Detect that case explicitly so the message is actionable.
    if (lower.includes("err_unknown_builtin_module") || lower.includes("node:sqlite")) {
      return {
        reachable: false,
        status: "sdk-missing",
        durationMs: Date.now() - started,
        message: `SDK requires Node 22+ (node:sqlite). You're on Node ${process.versions.node}.`,
      };
    }
    const isAuth =
      lower.includes("auth") ||
      lower.includes("token") ||
      lower.includes("login") ||
      lower.includes("not signed in") ||
      lower.includes("unauthor");
    return {
      reachable: false,
      status: isAuth ? "auth-missing" : "unknown",
      durationMs: Date.now() - started,
      message: msg.split("\n")[0],
    };
  }
}

/**
 * Run a single agent turn through the Copilot SDK with the given tools.
 * Returns the full streamed assistant text + a list of tool calls observed.
 */
export async function runProviderSession(cfg: ProviderSessionConfig): Promise<ProviderResult> {
  const started = Date.now();
  const idleMs = cfg.idleTimeoutMs ?? 600_000;
  const connectMs = cfg.connectTimeoutMs ?? 20_000;
  const progress = (stage: string) => cfg.onProgress?.(stage);

  progress("loading sdk");
  const client = (await getClient(cfg.debug ? "debug" : "error")) as {
    start(): Promise<void>;
    getState(): string;
    createSession(opts: unknown): Promise<{
      send(req: { prompt: string }): Promise<void>;
      on(event: string, handler: (e: unknown) => void): () => void;
      disconnect(): Promise<void>;
    }>;
  };

  if (typeof client.getState === "function" && client.getState() !== "connected") {
    progress("connecting");
    try {
      const startPromise = client.start();
      let timer: NodeJS.Timeout | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                `Copilot SDK did not connect within ${connectMs / 1000}s — likely missing copilot scope on gh token, missing Copilot CLI, or network unreachable`,
              ),
            ),
          connectMs,
        );
      });
      try {
        await Promise.race([startPromise, timeoutPromise]);
      } finally {
        if (timer) clearTimeout(timer);
        startPromise.catch(() => {});
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const hint = actionableHint(msg);
      throw new Error(hint ? `${msg}\n  → ${hint}` : msg);
    }
  }

  progress("creating session");
  const session = await client.createSession({
    clientName: cfg.clientName,
    model: cfg.model,
    systemMessage: { mode: "replace", content: cfg.systemPrompt },
    streaming: true,
    tools: cfg.tools.map((t) => sdkToolDescriptor(t, cfg.toolContext)),
    onPermissionRequest: () => ({ kind: "approve-once" as const }),
  });
  progress("session ready");

  let fullText = "";
  const toolCalls: { name: string; ok: boolean }[] = [];
  let idleTimer: NodeJS.Timeout | undefined;

  const unsubs: Array<() => void> = [];

  const result = new Promise<ProviderResult>((resolve, reject) => {
    const resetIdle = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        cleanup();
        reject(new Error(`provider session idle for ${idleMs / 1000}s — aborting`));
      }, idleMs);
    };

    const cleanup = () => {
      if (idleTimer) clearTimeout(idleTimer);
      unsubs.forEach((u) => u());
    };

    unsubs.push(
      session.on("assistant.message_delta", (raw) => {
        resetIdle();
        const delta = (raw as { data?: { deltaContent?: string } })?.data?.deltaContent ?? "";
        fullText += delta;
        cfg.events?.onDelta?.(delta);
      }),
    );

    unsubs.push(
      session.on("tool.execution_start", (raw) => {
        resetIdle();
        const name = (raw as { data?: { toolName?: string } })?.data?.toolName ?? "";
        cfg.events?.onToolStart?.(name);
      }),
    );

    unsubs.push(
      session.on("tool.execution_complete", (raw) => {
        resetIdle();
        const data = (raw as { data?: { toolName?: string; success?: boolean } })?.data ?? {};
        const ok = data.success !== false;
        toolCalls.push({ name: data.toolName ?? "", ok });
        cfg.events?.onToolEnd?.(data.toolName ?? "", ok);
      }),
    );

    unsubs.push(
      session.on("session.idle", () => {
        cleanup();
        resolve({ fullText, toolCalls, durationMs: Date.now() - started });
      }),
    );

    unsubs.push(
      session.on("session.error", (raw) => {
        const msg = (raw as { data?: { message?: string } })?.data?.message ?? "unknown session error";
        cfg.events?.onError?.(msg);
        cleanup();
        reject(new Error(msg));
      }),
    );

    resetIdle();
    session.send({ prompt: cfg.prompt }).catch((err: unknown) => {
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err)));
    });
  });

  try {
    return await result;
  } finally {
    try {
      await session.disconnect();
    } catch {
      /* ignore disconnect failures */
    }
  }
}

/** Convert a pwagent Tool into the SDK's tool-descriptor shape. */
function sdkToolDescriptor(tool: Tool, ctx: ToolContext): unknown {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    // Our tools (read, write, edit, bash, grep) collide with SDK built-ins.
    // overridesBuiltInTool: true tells the SDK to use our implementations,
    // which enforce pwagent's path guard + bash allowlist + tool sandbox limits.
    overridesBuiltInTool: true,
    handler: async (args: unknown) => {
      try {
        const result = await tool.run(args, ctx);
        return { ok: true, result };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, error: msg };
      }
    },
  };
}
