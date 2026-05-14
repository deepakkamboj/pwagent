import { Command } from "commander";
import { createInterface } from "node:readline/promises";
import { stdin, stdout, stderr } from "node:process";
import { mkdir, appendFile, readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { c, HR, glyph } from "../utils/colors.js";
import { prepareAgent } from "../runtime/coordinator.js";
import { createChatSession, type ChatSession } from "../runtime/provider.js";
import { writeAuditEvent } from "../audit/writer.js";

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
    const { statSync } = await import("node:fs");
    try {
      const s = statSync(join(SESSIONS_DIR, f));
      out.push({ id, ts: s.mtime.toISOString(), bytes: s.size });
    } catch {
      /* skip */
    }
  }
  return out.sort((a, b) => (a.ts < b.ts ? 1 : -1));
}

export const chatCommand = new Command("chat")
  .description("Open an interactive multi-turn chat with a pwagent specialist. Slash commands: /help, /agent, /agents, /model, /mode, /skills, /session, /clear, /exit.")
  .option("--agent <name>", "agent to chat with (default: supervisor)", "supervisor")
  .option("--model <id>", "override the agent's preferred model")
  .option("--mode <mode>", "response mode: direct | light | standard | full", "standard")
  .option("--cwd <path>", "working directory for tool calls", process.cwd())
  .option("--resume <id>", "resume a prior session by id (see: pwagent chat --list)")
  .option("--list", "list saved sessions and exit")
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
      debug?: boolean;
      connectTimeoutS: number;
      idleTimeoutS: number;
    }) => {
      if (opts.list) {
        const sessions = await listSessions();
        console.log(HR);
        if (sessions.length === 0) {
          console.log("  no saved sessions");
        } else {
          for (const s of sessions) {
            console.log(`  ${c.cyan(s.id)}  ${c.dim(`${s.ts}  ${(s.bytes / 1024).toFixed(1)} KB`)}`);
          }
        }
        console.log(HR);
        return;
      }

      // Resolve session id + path
      const sessionId = opts.resume ?? newSessionId();
      const sessionPath = join(SESSIONS_DIR, `${sessionId}.jsonl`);

      // If resuming, load prior turns so we can show context to the user (the SDK doesn't
      // replay them automatically — we open a fresh SDK session and replay below).
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
            /* skip malformed line */
          }
        }
      }

      // State mutable by slash commands
      let activeAgent = opts.agent;
      let activeModel = opts.model;
      let activeMode = opts.mode;

      const banner = (): void => {
        console.log(HR);
        console.log(
          `  ${c.bold("pwagent chat")} ${c.dim("→")} ${c.cyan(activeAgent)}   ${c.dim(`(model: ${activeModel ?? "auto"} · mode: ${activeMode} · session: ${sessionId})`)}`,
        );
        console.log(HR);
        console.log(c.dim("  Type /help for commands · /exit to quit"));
        if (priorTurns.length > 0) {
          console.log(c.dim(`  Resumed session with ${priorTurns.length} prior turn${priorTurns.length === 1 ? "" : "s"}`));
        }
        console.log();
      };

      // Prepare the agent + open the SDK chat session
      let prep = await prepareAgent({
        agent: activeAgent,
        prompt: priorTurns.find((t) => t.role === "user")?.content,
        modelOverride: activeModel,
        mode: activeMode,
        cwd: opts.cwd,
      });

      let session: ChatSession;
      try {
        session = await createChatSession({
          systemPrompt: prep.systemPrompt,
          model: prep.model,
          clientName: prep.clientName,
          tools: prep.tools,
          toolContext: prep.toolContext,
          connectTimeoutMs: opts.connectTimeoutS * 1000,
          idleTimeoutMs: opts.idleTimeoutS * 1000,
          debug: opts.debug,
          onProgress: (stage) => stderr.write(c.dim(`  ${glyph.pending} ${stage}…\n`)),
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(c.err(`error: ${msg}`));
        if (!msg.includes("→")) console.error(c.dim("  → run `pwagent doctor` to verify auth + prereqs"));
        process.exit(1);
      }

      banner();

      // If resuming, replay prior user turns so the SDK rebuilds context.
      // Run silently — don't re-print assistant deltas to the screen.
      if (priorTurns.length > 0) {
        stderr.write(c.dim(`  ${glyph.pending} replaying ${priorTurns.filter((t) => t.role === "user").length} prior turn(s) for context…\n`));
        for (const t of priorTurns) {
          if (t.role !== "user") continue;
          try {
            await session.send(t.content, {}); // silent — no onDelta wired
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(c.err(`error replaying turn: ${msg}`));
          }
        }
        stderr.write(c.dim(`  ${glyph.ok} context restored\n\n`));
      }

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
      const ask = async (): Promise<void> => {
        let promptLine: string;
        try {
          promptLine = await rl.question(`${c.cyan(">")} `);
        } catch {
          // readline closed (EOF on piped stdin, Ctrl-D, etc.) before a line arrived.
          // Exit cleanly without trying to send.
          return;
        }
        if (closing) return;
        const line = promptLine.trim();
        if (!line) return ask();

        // ── slash commands ───────────────────────────────────────────────
        if (line.startsWith("/")) {
          const [cmd, ...args] = line.slice(1).split(/\s+/);
          switch (cmd?.toLowerCase()) {
            case "help":
              console.log();
              console.log(c.bold("Slash commands"));
              console.log("  /help                   show this help");
              console.log("  /agents                 list available agents");
              console.log("  /agent <name>           switch active agent (rebuilds the session)");
              console.log("  /model <id>             switch model (rebuilds the session)");
              console.log("  /mode <m>               direct | light | standard | full (next turn)");
              console.log("  /skills                 show skills injected for the current agent");
              console.log("  /session                show session id + path");
              console.log("  /clear                  clear screen");
              console.log("  /exit, /quit            disconnect and exit");
              console.log();
              return ask();
            case "agents": {
              const { loadCharters } = await import("../charters/loader.js");
              const { list } = await loadCharters(opts.cwd);
              console.log();
              for (const ch of list) {
                const marker = ch.name === activeAgent ? c.cyan("→ ") : "  ";
                console.log(`${marker}${ch.name.padEnd(20)} ${c.dim(ch.description.slice(0, 60))}`);
              }
              console.log();
              return ask();
            }
            case "agent": {
              const next = args[0];
              if (!next) {
                console.log(c.err("usage: /agent <name>"));
                return ask();
              }
              try {
                const newPrep = await prepareAgent({ agent: next, modelOverride: activeModel, mode: activeMode, cwd: opts.cwd });
                await session.disconnect();
                session = await createChatSession({
                  systemPrompt: newPrep.systemPrompt,
                  model: newPrep.model,
                  clientName: newPrep.clientName,
                  tools: newPrep.tools,
                  toolContext: newPrep.toolContext,
                  connectTimeoutMs: opts.connectTimeoutS * 1000,
                  idleTimeoutMs: opts.idleTimeoutS * 1000,
                  debug: opts.debug,
                  onProgress: (stage) => stderr.write(c.dim(`  ${glyph.pending} ${stage}…\n`)),
                });
                prep = newPrep;
                activeAgent = next;
                console.log(c.dim(`  switched to ${activeAgent} (new session)`));
              } catch (err: unknown) {
                console.log(c.err(`  ${err instanceof Error ? err.message : String(err)}`));
              }
              return ask();
            }
            case "model": {
              const next = args[0];
              if (!next) {
                console.log(c.err("usage: /model <id>"));
                return ask();
              }
              activeModel = next;
              try {
                const newPrep = await prepareAgent({ agent: activeAgent, modelOverride: activeModel, mode: activeMode, cwd: opts.cwd });
                await session.disconnect();
                session = await createChatSession({
                  systemPrompt: newPrep.systemPrompt,
                  model: newPrep.model,
                  clientName: newPrep.clientName,
                  tools: newPrep.tools,
                  toolContext: newPrep.toolContext,
                  connectTimeoutMs: opts.connectTimeoutS * 1000,
                  idleTimeoutMs: opts.idleTimeoutS * 1000,
                  debug: opts.debug,
                  onProgress: (stage) => stderr.write(c.dim(`  ${glyph.pending} ${stage}…\n`)),
                });
                prep = newPrep;
                console.log(c.dim(`  switched to model ${activeModel} (new session)`));
              } catch (err: unknown) {
                console.log(c.err(`  ${err instanceof Error ? err.message : String(err)}`));
              }
              return ask();
            }
            case "mode": {
              const next = args[0]?.toLowerCase();
              if (next !== "direct" && next !== "light" && next !== "standard" && next !== "full") {
                console.log(c.err("usage: /mode direct|light|standard|full"));
                return ask();
              }
              activeMode = next;
              console.log(c.dim(`  next-turn mode = ${activeMode} (mode is hint-only inside an open SDK session)`));
              return ask();
            }
            case "skills":
              console.log();
              if (prep.skillsInjected.length === 0) {
                console.log(c.dim("  (no skills injected for this prompt)"));
              } else {
                for (const s of prep.skillsInjected) console.log(`  ${c.cyan(s.id)}  ${c.dim(s.reason)}`);
              }
              console.log();
              return ask();
            case "session":
              console.log();
              console.log(`  ${c.bold("id  ")} ${sessionId}`);
              console.log(`  ${c.bold("path")} ${sessionPath}`);
              console.log();
              return ask();
            case "clear":
              process.stdout.write("\x1b[2J\x1b[H");
              banner();
              return ask();
            case "exit":
            case "quit":
              console.log(c.dim("  bye."));
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
            default:
              console.log(c.err(`  unknown command: /${cmd} (try /help)`));
              return ask();
          }
        }

        // ── normal turn ──────────────────────────────────────────────────
        await appendTurn(sessionPath, {
          ts: new Date().toISOString(),
          role: "user",
          content: line,
          agent: activeAgent,
          model: prep.model,
        });
        try {
          const turn = await session.send(line, {
            onDelta: (chunk) => stdout.write(chunk),
            onToolStart: (name) => stderr.write(c.dim(`\n  ${glyph.pending} ${name}\n`)),
            onToolEnd: (name, ok) => stderr.write(c.dim(`  ${ok ? glyph.ok : glyph.err} ${name}\n`)),
          });
          stdout.write("\n");
          await appendTurn(sessionPath, {
            ts: new Date().toISOString(),
            role: "assistant",
            content: turn.fullText,
            agent: activeAgent,
            model: prep.model,
            toolCalls: turn.toolCalls,
            durationMs: turn.durationMs,
          });
          stderr.write(c.dim(`  ${glyph.ok} ${(turn.durationMs / 1000).toFixed(1)}s · ${turn.toolCalls.length} tool calls\n\n`));
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(c.err(`error: ${msg}`));
          await appendTurn(sessionPath, {
            ts: new Date().toISOString(),
            role: "system",
            content: `error: ${msg}`,
            agent: activeAgent,
            model: prep.model,
          });
        }
        return ask();
      };

      rl.on("close", () => {
        // Mark closing so any in-flight turn knows not to issue another send().
        // The disconnect happens after the current ask() unwinds (via /exit or natural EOF return).
        closing = true;
      });
      // Final disconnect happens when the loop ends.
      process.on("beforeExit", async () => {
        await session.disconnect();
      });

      // Handle Ctrl-C cleanly
      rl.on("SIGINT", async () => {
        console.log();
        console.log(c.dim("  caught SIGINT — disconnecting…"));
        await session.disconnect();
        rl.close();
        process.exit(130);
      });

      await ask();
    },
  );
