/**
 * `pwagent chat` — the daily-driver entry point.
 *
 * - 100% GitHub Copilot CLI visual parity (pink dots, checkmarks, dim sub-lines, › prompt).
 * - Long-lived SDK session for the active agent (default: supervisor).
 * - The supervisor has a `dispatch_to_agent` tool injected so free text routes autonomously.
 * - Slash commands cover everything Copilot CLI has + each agent name as `/<agent> <args>`.
 * - Startup probe: < 800ms doctor check, renders one-line status above the prompt.
 * - Modal helper: `runModal()` pauses readline so /init, /login, /doctor --fix can prompt.
 * - Sessions persisted to ~/.pwagent/sessions/<id>.jsonl, JSON Lines.
 */

import { Command } from "commander";
import { createInterface, type Interface as ReadlineInterface } from "node:readline/promises";
import { stdin, stdout, stderr } from "node:process";
import { mkdir, appendFile, readFile, readdir } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import pc from "picocolors";
import { c, glyph } from "../utils/colors.js";
import { showBanner, shouldShowBanner } from "../utils/banner.js";
import { prepareAgent } from "../runtime/coordinator.js";
import { createChatSession, type ChatSession } from "../runtime/provider.js";
import { invoke } from "../runtime/coordinator.js";
import { makeDispatchTool } from "../runtime/dispatch.js";
import { writeAuditEvent } from "../audit/writer.js";
import { loadCharters } from "../charters/loader.js";
import { configExists, loadConfig } from "../config/loader.js";
import { paths } from "../utils/paths.js";
import packageJson from "../../package.json" with { type: "json" };
import {
  PROMPT,
  blank,
  done,
  dot,
  envLine,
  fail,
  renderTool,
  statusBar,
  statusOneLine,
  subline,
  write,
} from "./chat-render.js";

const SESSIONS_DIR = join(homedir(), ".pwagent", "sessions");

interface SessionTurnRecord {
  ts: string;
  role: "user" | "assistant" | "system";
  content: string;
  agent: string;
  model: string;
  toolCalls?: { name: string; ok: boolean }[];
  durationMs?: number;
}

function newSessionId(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const rand = Math.random().toString(36).slice(2, 6);
  return `${ts}-${rand}`;
}

async function appendTurn(sessionPath: string, record: SessionTurnRecord): Promise<void> {
  await mkdir(SESSIONS_DIR, { recursive: true });
  await appendFile(sessionPath, JSON.stringify(record) + "\n", "utf8");
}

async function listSessions(): Promise<{ id: string; ts: string; bytes: number }[]> {
  if (!existsSync(SESSIONS_DIR)) return [];
  const entries = await readdir(SESSIONS_DIR);
  const out: { id: string; ts: string; bytes: number }[] = [];
  for (const f of entries) {
    if (!f.endsWith(".jsonl")) continue;
    const id = f.replace(/\.jsonl$/, "");
    try {
      const s = statSync(join(SESSIONS_DIR, f));
      out.push({ id, ts: s.mtime.toISOString(), bytes: s.size });
    } catch {
      /* skip unreadable */
    }
  }
  return out.sort((a, b) => (a.ts < b.ts ? 1 : -1));
}

// ── git branch (best-effort, used in env line) ──────────────────────────────

function getGitBranch(cwd: string): string | undefined {
  try {
    const result = spawnSync("git", ["branch", "--show-current"], { cwd, encoding: "utf8" });
    if (result.status === 0) {
      const branch = result.stdout.trim();
      return branch || undefined;
    }
  } catch {
    /* not a git repo or git missing */
  }
  return undefined;
}

// ── fast startup probe ──────────────────────────────────────────────────────

interface ProbeResult {
  ok: boolean;
  summary: string;
  hint?: string;
  hasConfig: boolean;
}

async function fastProbe(): Promise<ProbeResult> {
  const hasConfig = await configExists();
  if (!hasConfig) {
    return {
      ok: false,
      hasConfig: false,
      summary: "first run — no config yet",
      hint: "Type /init to configure (one-time, ~30 seconds)",
    };
  }
  // gh auth check — fast, reads keychain only
  let ghAuth = false;
  try {
    const r = spawnSync("gh", ["auth", "status"], { encoding: "utf8" });
    ghAuth = r.status === 0;
  } catch {
    ghAuth = false;
  }
  if (!ghAuth) {
    return {
      ok: false,
      hasConfig: true,
      summary: "gh not authenticated",
      hint: "Type /login to sign in (opens browser)",
    };
  }
  return { ok: true, hasConfig: true, summary: "ready" };
}

// ── modal helper — pause readline for interactive sub-flows ────────────────

async function runModal<T>(rl: ReadlineInterface, fn: () => Promise<T>): Promise<T> {
  rl.pause();
  try {
    return await fn();
  } finally {
    rl.resume();
  }
}

// ── slash command grouping for /help ───────────────────────────────────────

const HELP_GROUPS = [
  {
    name: "Setup",
    items: [
      { cmd: "/init", desc: "Reconfigure provider, ADO, repos (interactive)" },
      { cmd: "/doctor [--fix] [--no-probe]", desc: "Run health check; --fix installs missing prereqs" },
      { cmd: "/login", desc: "Authenticate with GitHub (Copilot SDK)" },
      { cmd: "/logout", desc: "Sign out of GitHub" },
    ],
  },
  {
    name: "Agent control",
    items: [
      { cmd: "/agents", desc: "List the 13 specialist agents" },
      { cmd: "/agent <name>", desc: "Switch active agent (rebuilds the chat session)" },
      { cmd: "/<name> [args]", desc: "Direct one-shot call to that specialist (e.g. /fix --orchestrate --ado-pipeline N)" },
      { cmd: "/model <id>", desc: "Switch model for the active session" },
      { cmd: "/mode direct|light|standard|full", desc: "Change response mode" },
      { cmd: "/skills", desc: "Show injected skills for the current agent" },
    ],
  },
  {
    name: "Session",
    items: [
      { cmd: "/session", desc: "Show current session id + path" },
      { cmd: "/list-sessions", desc: "List saved sessions" },
      { cmd: "/cwd [path]", desc: "Show or change tool working directory" },
      { cmd: "/clear", desc: "Clear screen and redraw banner" },
      { cmd: "/exit  /quit", desc: "Disconnect and exit" },
      { cmd: "/help [agent]", desc: "Show this list or one agent's invocation patterns" },
    ],
  },
];

function renderHelp(): void {
  blank();
  for (const grp of HELP_GROUPS) {
    write(c.bold(`  ${grp.name}`));
    for (const it of grp.items) {
      write(`    ${c.cyan(it.cmd.padEnd(38))} ${c.dim(it.desc)}`);
    }
    blank();
  }
  write(c.dim("  Type free text to chat — the supervisor will route to a specialist."));
  write(c.dim("  Type / followed by a specialist name to call them directly."));
  blank();
}

// ── chat command ────────────────────────────────────────────────────────────

export const chatCommand = new Command("chat")
  .description(
    "Open an interactive multi-turn chat with pwagent. Free text routes via supervisor; slash commands invoke any agent directly. Sessions auto-saved to ~/.pwagent/sessions/<id>.jsonl.",
  )
  .option("--agent <name>", "agent to chat with (default: supervisor)", "supervisor")
  .option("--model <id>", "override the agent's preferred model")
  .option("--mode <mode>", "response mode: direct | light | standard | full", "standard")
  .option("--cwd <path>", "working directory for tool calls", process.cwd())
  .option("--resume <id>", "resume a prior session by id (see: pwagent chat --list)")
  .option("--list", "list saved sessions and exit")
  .option("--no-banner", "skip the rainbow ASCII banner")
  .option("--debug", "raise SDK log level to debug; print init progress to stderr")
  .option("--connect-timeout-s <n>", "SDK connect timeout in seconds (default 20)", (v) => parseInt(v, 10), 20)
  .option("--idle-timeout-s <n>", "session idle timeout per turn in seconds (default 600)", (v) => parseInt(v, 10), 600)
  .action(
    async (opts: {
      agent: string;
      model?: string;
      mode: "direct" | "light" | "standard" | "full";
      cwd: string;
      resume?: string;
      list?: boolean;
      banner?: boolean;
      debug?: boolean;
      connectTimeoutS: number;
      idleTimeoutS: number;
    }) => {
      // ── list mode (no SDK) ────────────────────────────────────────────────
      if (opts.list) {
        const sessions = await listSessions();
        blank();
        if (sessions.length === 0) {
          write(c.dim("  no saved sessions"));
        } else {
          for (const s of sessions) {
            write(`  ${c.cyan(s.id.padEnd(40))}  ${c.dim(`${s.ts}  ${(s.bytes / 1024).toFixed(1)} KB`)}`);
          }
        }
        blank();
        return;
      }

      const sessionId = opts.resume ?? newSessionId();
      const sessionPath = join(SESSIONS_DIR, `${sessionId}.jsonl`);

      let activeAgent = opts.agent;
      let activeModel = opts.model;
      let activeMode = opts.mode;
      let activeCwd = opts.cwd;

      // ── banner ────────────────────────────────────────────────────────────
      if (opts.banner !== false && shouldShowBanner()) showBanner();

      // ── startup probe ────────────────────────────────────────────────────
      const probe = await fastProbe();
      blank();
      write(statusOneLine(probe.ok, [
        probe.summary,
        `v${(packageJson as { version: string }).version}`,
        activeModel ?? "auto",
        `${activeCwd}${(() => {
          const b = getGitBranch(activeCwd);
          return b ? `  [${b}]` : "";
        })()}`,
      ]));
      if (probe.hint) write(c.dim(`  ${probe.hint}`));
      blank();

      // ── load prior session (resume) ──────────────────────────────────────
      let priorTurns: SessionTurnRecord[] = [];
      if (opts.resume) {
        if (!existsSync(sessionPath)) {
          console.error(c.err(`error: session ${opts.resume} not found at ${sessionPath}`));
          process.exit(1);
        }
        const raw = await readFile(sessionPath, "utf8");
        for (const line of raw.split("\n")) {
          if (!line.trim()) continue;
          try {
            priorTurns.push(JSON.parse(line) as SessionTurnRecord);
          } catch {
            /* skip malformed */
          }
        }
      }

      // ── prepare supervisor + inject dispatch tool ────────────────────────
      let prep = await prepareAgent({
        agent: activeAgent,
        prompt: priorTurns.find((t) => t.role === "user")?.content,
        modelOverride: activeModel,
        mode: activeMode,
        cwd: activeCwd,
      });

      // Capture state for tool re-injection on agent switch
      const buildSessionWithDispatch = async (): Promise<ChatSession> => {
        const dispatchTool = makeDispatchTool({
          cwd: activeCwd,
          onDispatch: (agent, prompt) => {
            // The SDK's tool.execution_start event will also fire and render through renderTool —
            // we don't double-render here. Reserved for future use (e.g. early progress feedback).
            void agent;
            void prompt;
          },
        });
        // Only the supervisor gets the dispatch tool. Other specialists never dispatch.
        const tools = activeAgent === "supervisor" ? [...prep.tools, dispatchTool] : prep.tools;
        return await createChatSession({
          systemPrompt: prep.systemPrompt,
          model: prep.model,
          clientName: prep.clientName,
          tools,
          toolContext: prep.toolContext,
          connectTimeoutMs: opts.connectTimeoutS * 1000,
          idleTimeoutMs: opts.idleTimeoutS * 1000,
          debug: opts.debug,
          onProgress: (stage) => stderr.write(c.dim(`  ${glyph.pending} ${stage}…\n`)),
        });
      };

      let session: ChatSession;
      try {
        session = await buildSessionWithDispatch();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(c.err(`error: ${msg}`));
        if (!msg.includes("→")) console.error(c.dim("  → type /doctor to verify auth + prereqs"));
        process.exit(1);
      }

      // ── replay prior session into the new SDK session ───────────────────
      if (priorTurns.length > 0) {
        write(c.dim(`  ${glyph.pending} resumed ${priorTurns.filter((t) => t.role === "user").length} prior turn(s) for context…`));
        for (const t of priorTurns) {
          if (t.role !== "user") continue;
          try {
            await session.send(t.content, {});
          } catch {
            /* swallow replay errors — they don't block new turns */
          }
        }
        write(c.dim(`  ${glyph.ok} context restored`));
        blank();
      }

      // ── readline loop ────────────────────────────────────────────────────
      const rl = createInterface({ input: stdin, output: stdout });
      const runId = `chat_${sessionId}`;
      await writeAuditEvent({
        type: "run.start",
        timestamp: new Date().toISOString(),
        agent: activeAgent,
        runId,
        data: { mode: "chat", sessionId },
      });

      let closing = false;

      const renderEnvAndPrompt = (): void => {
        const branch = getGitBranch(activeCwd);
        blank();
        write(envLine(activeCwd, branch));
        blank();
        // status bar above the prompt
        write(statusBar({
          version: (packageJson as { version: string }).version,
          model: prep.model,
          agent: activeAgent,
        }));
        blank();
      };

      // Print the initial env line + status bar so the user sees state before typing
      renderEnvAndPrompt();

      const rebuildSession = async (): Promise<void> => {
        await session.disconnect();
        prep = await prepareAgent({
          agent: activeAgent,
          modelOverride: activeModel,
          mode: activeMode,
          cwd: activeCwd,
        });
        session = await buildSessionWithDispatch();
      };

      const ask = async (): Promise<void> => {
        let promptLine: string;
        try {
          promptLine = await rl.question(PROMPT);
        } catch {
          // readline closed (EOF on piped stdin, Ctrl-D). Exit cleanly.
          return;
        }
        if (closing) return;
        const line = promptLine.trim();
        if (!line) return ask();

        // ── slash commands ─────────────────────────────────────────────────
        if (line.startsWith("/")) {
          const [rawCmd, ...args] = line.slice(1).split(/\s+/);
          const cmd = (rawCmd ?? "").toLowerCase();

          switch (cmd) {
            case "help": {
              if (args[0]) {
                const { byName } = await loadCharters(activeCwd);
                const ch = byName.get(args[0]);
                if (ch) {
                  blank();
                  write(dot(`Charter: ${ch.name}`));
                  write(subline(ch.description));
                  blank();
                } else {
                  write(c.err(`  unknown agent: ${args[0]}`));
                }
              } else {
                renderHelp();
              }
              return ask();
            }

            case "agents": {
              const { list } = await loadCharters(activeCwd);
              blank();
              for (const ch of list) {
                const marker = ch.name === activeAgent ? c.cyan(" → ") : "   ";
                write(`${marker}${ch.name.padEnd(14)} ${c.dim(ch.description.slice(0, 70))}`);
              }
              blank();
              return ask();
            }

            case "agent": {
              const next = args[0];
              if (!next) {
                write(c.err("  usage: /agent <name>"));
                return ask();
              }
              try {
                activeAgent = next;
                await rebuildSession();
                write(c.dim(`  switched to ${activeAgent} (new session)`));
              } catch (err: unknown) {
                write(c.err(`  ${err instanceof Error ? err.message : String(err)}`));
              }
              return ask();
            }

            case "model": {
              const next = args[0];
              if (!next) {
                write(c.err("  usage: /model <id>"));
                return ask();
              }
              activeModel = next;
              try {
                await rebuildSession();
                write(c.dim(`  switched to model ${activeModel} (new session)`));
              } catch (err: unknown) {
                write(c.err(`  ${err instanceof Error ? err.message : String(err)}`));
              }
              return ask();
            }

            case "mode": {
              const next = args[0]?.toLowerCase();
              if (next !== "direct" && next !== "light" && next !== "standard" && next !== "full") {
                write(c.err("  usage: /mode direct|light|standard|full"));
                return ask();
              }
              activeMode = next;
              write(c.dim(`  next-turn mode = ${activeMode}`));
              return ask();
            }

            case "skills": {
              blank();
              if (prep.skillsInjected.length === 0) {
                write(c.dim("  (no skills injected for this prompt)"));
              } else {
                for (const s of prep.skillsInjected) {
                  write(`  ${c.cyan(s.id)}  ${c.dim(s.reason)}`);
                }
              }
              blank();
              return ask();
            }

            case "session": {
              blank();
              write(`  ${c.bold("id  ")} ${sessionId}`);
              write(`  ${c.bold("path")} ${sessionPath}`);
              blank();
              return ask();
            }

            case "list-sessions": {
              const sessions = await listSessions();
              blank();
              for (const s of sessions) {
                write(`  ${c.cyan(s.id.padEnd(40))}  ${c.dim(`${s.ts}  ${(s.bytes / 1024).toFixed(1)} KB`)}`);
              }
              blank();
              return ask();
            }

            case "cwd": {
              const next = args.join(" ").trim();
              if (!next) {
                write(c.dim(`  ${activeCwd}`));
              } else if (!existsSync(next)) {
                write(c.err(`  not a directory: ${next}`));
              } else {
                activeCwd = next;
                await rebuildSession();
                write(c.dim(`  cwd → ${activeCwd}`));
              }
              return ask();
            }

            case "clear": {
              process.stdout.write("\x1b[2J\x1b[H");
              if (opts.banner !== false && shouldShowBanner()) showBanner();
              renderEnvAndPrompt();
              return ask();
            }

            case "exit":
            case "quit": {
              write(c.dim("  bye."));
              closing = true;
              await session.disconnect();
              await writeAuditEvent({
                type: "run.complete",
                timestamp: new Date().toISOString(),
                agent: activeAgent,
                runId,
                data: { mode: "chat", sessionId },
              });
              rl.close();
              return;
            }

            case "doctor": {
              await runModal(rl, async () => {
                // Spawn the same pwagent binary so the doctor command's full output renders.
                // The doctor command writes directly to stdout/stderr — perfect for inheriting.
                const r = spawnSync(process.execPath, [process.argv[1] ?? "", "doctor", ...args], {
                  stdio: "inherit",
                });
                if (r.status !== 0) write(c.err("  doctor reported issues — see above"));
              });
              return ask();
            }

            case "init": {
              await runModal(rl, async () => {
                const r = spawnSync(process.execPath, [process.argv[1] ?? "", "init", ...args], {
                  stdio: "inherit",
                });
                if (r.status !== 0) write(c.err("  init did not complete"));
              });
              return ask();
            }

            case "login": {
              await runModal(rl, async () => {
                const r = spawnSync(process.execPath, [process.argv[1] ?? "", "login"], { stdio: "inherit" });
                if (r.status !== 0) write(c.err("  login did not complete"));
              });
              return ask();
            }

            case "logout": {
              await runModal(rl, async () => {
                const r = spawnSync(process.execPath, [process.argv[1] ?? "", "logout"], { stdio: "inherit" });
                if (r.status !== 0) write(c.err("  logout did not complete"));
              });
              return ask();
            }

            default: {
              // Treat `/<agent-name> [args]` as a direct one-shot specialist call.
              const { byName } = await loadCharters(activeCwd);
              if (byName.has(cmd)) {
                const subPrompt = args.join(" ");
                blank();
                write(dot(`${cmd}  ${pc.dim(subPrompt || "(no args)")}`));
                try {
                  const result = await invoke({
                    agent: cmd,
                    prompt: subPrompt || `Run agent ${cmd}`,
                    mode: activeMode,
                    cwd: activeCwd,
                    events: {
                      onDelta: (chunk) => stdout.write(chunk),
                      onToolStart: (name) => renderTool({ tool: name }),
                      onToolEnd: (name, ok) => renderTool({ tool: name, result: { ok } }),
                    },
                  });
                  blank();
                  write(done(`${cmd} done · ${((result.durationMs ?? 0) / 1000).toFixed(1)}s · ${result.toolCalls?.length ?? 0} tool calls`));
                  await appendTurn(sessionPath, {
                    ts: new Date().toISOString(),
                    role: "system",
                    content: `/${cmd} ${subPrompt}`.trim(),
                    agent: cmd,
                    model: result.model,
                    toolCalls: result.toolCalls,
                    durationMs: result.durationMs,
                  });
                  await appendTurn(sessionPath, {
                    ts: new Date().toISOString(),
                    role: "assistant",
                    content: result.output ?? "",
                    agent: cmd,
                    model: result.model,
                  });
                } catch (err: unknown) {
                  const msg = err instanceof Error ? err.message : String(err);
                  write(fail(msg));
                }
                blank();
                renderEnvAndPrompt();
                return ask();
              }
              write(c.err(`  unknown command: /${cmd} (try /help)`));
              return ask();
            }
          }
        }

        // ── normal turn (free text → active agent / supervisor → autonomous routing) ──
        await appendTurn(sessionPath, {
          ts: new Date().toISOString(),
          role: "user",
          content: line,
          agent: activeAgent,
          model: prep.model,
        });
        blank();
        try {
          const turn = await session.send(line, {
            onDelta: (chunk) => stdout.write(chunk),
            onToolStart: (name) => {
              blank();
              renderTool({ tool: name });
            },
            onToolEnd: (name, ok) => renderTool({ tool: name, result: { ok } }),
          });
          blank();
          await appendTurn(sessionPath, {
            ts: new Date().toISOString(),
            role: "assistant",
            content: turn.fullText,
            agent: activeAgent,
            model: prep.model,
            toolCalls: turn.toolCalls,
            durationMs: turn.durationMs,
          });
          write(done(`${(turn.durationMs / 1000).toFixed(1)}s · ${turn.toolCalls.length} tool calls`));
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          write(fail(msg));
          await appendTurn(sessionPath, {
            ts: new Date().toISOString(),
            role: "system",
            content: `error: ${msg}`,
            agent: activeAgent,
            model: prep.model,
          });
        }
        renderEnvAndPrompt();
        return ask();
      };

      rl.on("close", () => {
        closing = true;
      });

      rl.on("SIGINT", async () => {
        blank();
        write(c.dim("  caught SIGINT — disconnecting…"));
        await session.disconnect();
        rl.close();
        process.exit(130);
      });

      // We rely on coordinator/auth being good enough not to need cfg checks here
      void loadConfig().catch(() => undefined);
      void paths.config;

      await ask();
    },
  );
