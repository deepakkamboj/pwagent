# pwagent — gaps vs. ConnectBuddy (and similar Copilot-CLI-hosted agents)

> Snapshot of where pwagent stands today (2026-05-14) when compared with a working Squad-based agent project (**ConnectBuddy**, `D:\gith\ConnectBuddy`) that the user described as "working fine, with inbuilt chat like Claude Code and GitHub Copilot CLI."
>
> This file is descriptive only — **no code changes recommended without explicit go-ahead**.

---

## 1. Where ConnectBuddy's "chat" actually comes from

The chat in the screenshot is **GitHub Copilot CLI itself** — visible at the bottom: `v1.0.48 available · run /update · / commands · ? help GPT-5.4 mini`. The conversation surface (input line, history, slash commands, mode switches, streamed output) is provided by:

```
copilot --yolo --resume
```

i.e. the user runs **Copilot CLI** in the ConnectBuddy workspace; Copilot CLI loads the `.github/agents/squad.agent.md` coordinator manifest (1,146 lines, ~74 KB) as the "Squad" agent; that coordinator reads `.squad/agents/<name>/charter.md` for each specialist; routing decisions are made inside one Copilot session.

**ConnectBuddy itself ships nothing that runs.** It's a workspace bundle of:

- `.github/agents/squad.agent.md` — the upstream 74 KB Squad coordinator prompt
- `.squad/` — agent charters, routing, ceremonies, decisions, skills, casting
- `samples/` — `.pptx` / `.docx` / `.pdf` role docs
- `docs/` — instructions
- Setup scripts

The "agent runtime" is whatever model is behind Copilot CLI (`GPT-5.4 mini` in the screenshot). ConnectBuddy's `package.json` doesn't exist — it isn't a Node project.

**So the chat experience is not built by ConnectBuddy — it's borrowed from Copilot CLI.**

---

## 2. What pwagent does instead, and the trade

pwagent **deliberately doesn't** depend on Copilot CLI. From the README's Design Rationale:

> "Make `pwagent` work like `playwright`." Install it once with `npm i -g @pwagent/cli`. It carries its own agent runtime, its own scheduler, its own model client. It does **not** depend on `gh copilot`, does **not** require VS Code, does **not** install a Copilot plugin.

The benefits we listed:

- One install, one mental model, one update path
- Works on CI runners, air-gapped boxes, locked-down VDIs
- No 74 KB coordinator manifest tax per session
- Scheduler not a separate thing
- VS Code optional
- Removable (`npm uninstall -g @pwagent/cli && rm -rf ~/.pwagent/`)

The cost we accepted:

- We give up Copilot CLI's chat UI (we don't have a REPL of our own)
- We give up `--resume` (no session persistence yet)
- We give up `/commands`
- We have to call `@github/copilot-sdk` ourselves — and right now those calls are timing out on this machine

ConnectBuddy made the **opposite** trade: get the chat UX for free, accept the Copilot CLI dependency and the per-session token tax.

---

## 3. Feature-by-feature gap

| Capability | ConnectBuddy (via Copilot CLI + Squad) | pwagent today | Gap |
|---|---|---|---|
| **Interactive REPL chat** | Provided by Copilot CLI | One-shot only (`pwagent run <agent> "..."`) | **L — Large.** No persistent chat. Every invocation is fresh. |
| **Session resume** (`--resume`) | Provided by Copilot CLI | None | **M — Medium.** Could add `pwagent chat --resume` with a session store. |
| **Slash commands** (`/help`, `/clear`, `/update`) | Provided by Copilot CLI | None | **S — Small.** Easy to add inside a REPL implementation. |
| **`--yolo` autonomous mode toggle** | Provided by Copilot CLI | Closest equiv: `--skip-gate` flag, no UI toggle | **S — Small.** A REPL command could flip a mode flag. |
| **Streamed output** | Provided by Copilot CLI | Yes (CLI tail mode) | None — pwagent already streams. |
| **Persistent agent identity / casting** | Squad's casting registry, `.squad/casting/registry.json` | Same convention — `~/.pwagent/casting/registry.json` (opt-in, off by default) | None |
| **Agent charters** | `.squad/agents/<name>/charter.md` | `cli/src/content/agents/<name>/charter.md` (embedded) + workspace `.pwagent/` + `.squad/` override | None |
| **Routing table** | `.squad/routing.md` | Same, loaded by coordinator | None |
| **Ceremonies** | `.squad/ceremonies.md` | Same | None |
| **Reviewer gates** | Enforced by Squad coordinator | Enforced by pwagent runtime | None — pwagent enforces them itself |
| **Multi-agent parallel spawn** | `Promise.all` inside Squad coordinator | `Promise.all` inside pwagent runtime | None |
| **MCP integration** | WorkIQ MCP for M365 data | **None** | **M — Medium.** pwagent has no MCP at all. Not a problem for Playwright testing, but would block ConnectBuddy-style M365 use cases. |
| **Provider** | Whatever Copilot CLI uses (GPT-5.4 mini in screenshot) | `@github/copilot-sdk` (Claude family by default; configurable) | None functionally, but see #4 below — our SDK calls aren't actually working. |
| **Scheduler** | None — Copilot CLI is interactive only | In-process tick loop, hot-reload, JSONL events, daemon mode | **pwagent wins here.** |
| **Audit log** | None | `~/.pwagent/audit/events.jsonl` append-only | **pwagent wins.** |
| **Portal dashboard** | None | Next.js 15 at `127.0.0.1:7337` | **pwagent wins.** |
| **Docs site** | None | Nextra at `127.0.0.1:7338` | **pwagent wins.** |
| **CI / unattended mode** | Limited — Copilot CLI is interactive | First-class via `pwagent run`, scheduler, service install | **pwagent wins.** |
| **Air-gap / no-network** | Impossible — depends on Copilot service | Same model dependency, but binary is self-contained | Tie at the model dep; pwagent better at the install level. |

---

## 4. The acute blocker — live SDK calls hang

This isn't a design gap, it's a **bug** on this machine:

```
pwagent doctor       → copilot probe times out at 5s
pwagent run <agent>  → SDK invocation hangs, exits with timeout
```

Evidence:

- `gh auth status` shows logged in as `deepakkamboj` with scopes `gist, read:org, read:user, repo, workflow` — **no `copilot` scope** in the gh OAuth token
- `pwagent whoami` reports `✗ gh copilot extension missing — run pwagent prereqs --install gh-copilot`
- `gh copilot --version` reports `! Copilot CLI not installed`
- Audit log isn't being written — agent invocations die before they reach the `run.start` event emitter

Likely root causes (one or more):

1. **gh token lacks the `copilot` OAuth scope.** `@github/copilot-sdk` needs to mint a Copilot-scoped token from the gh keychain; without that scope it stalls. Fix: `gh auth refresh -h github.com -s copilot`.
2. **`gh copilot` standalone CLI not installed.** Newer gh ships `copilot` as a built-in stub; the actual Copilot CLI lives at `https://github.com/github/gh-copilot` and must be installed separately. Some SDK code paths probe for it. Fix: `winget install GitHub.cli.copilot` or `gh extension install --force github/gh-copilot`.
3. **Corporate proxy / browser extension interception.** The same machine had `X-Forwarded-*` headers injected on localhost requests (we patched the portal middleware for that). The Copilot endpoint may be reachable but slow / TLS-renegotiating. ConnectBuddy works on the same machine because Copilot CLI handles the proxy quirks itself.
4. **Our SDK adapter doesn't surface the error.** We see `EXIT=124` from `timeout 60` but no structured error from the SDK before that. The adapter at [cli/src/runtime/](cli/src/runtime/) needs better error logging.

Until at least #1 and #2 are fixed, **no live agent execution will work via pwagent run**, even though every other layer (charters, routing, coordinator, dry-run, audit, portal, docs) is in place.

---

## 5. Where pwagent and ConnectBuddy could coexist

There's a neat pairing if we want it:

- pwagent's `.pwagent/agents/<name>/charter.md` directories are **already drop-in compatible with `.squad/`** — same frontmatter shape, same section headers.
- A user could run `copilot --yolo --resume` in a pwagent workspace and Squad would pick up our charters via the `.squad/` fallback path our loader supports.
- Conversely, ConnectBuddy's `.squad/` directory could be opened by pwagent and our coordinator would route its agents (with our `.pwagent/` taking precedence if both exist).

This isn't a "gap" so much as an opportunity — both runtimes can read each other's filesystem layout. pwagent is **Squad's design with our runtime**.

---

## 6. Paths forward (ranked by effort, no commitments)

### Path A — Fix the SDK invocation (recommended)

Restores live execution without changing the design. Steps:

1. `gh auth refresh -s copilot` — add the missing scope
2. Install the Copilot CLI (separate from gh extension)
3. Re-run `pwagent doctor` — confirm probe succeeds
4. Surface SDK errors properly in the adapter (right now they're silent — exit 124 with zero stdout, zero audit event)
5. Add a `--debug` flag that prints the SDK initialization steps

**Effort:** small (1–2 hours)
**Gives us:** working live calls through all 13 agents

### Path B — Add `pwagent chat` REPL on top of the SDK

Wraps the same coordinator + SDK in an interactive prompt with `/help`, `/clear`, `/resume`, `/exit`, slash-command parsing. Same model calls, just persistent.

**Effort:** medium (1–2 days). Needs:
- A REPL loop using `readline` or `ink`
- Session store at `~/.pwagent/sessions/<id>.jsonl`
- Per-session conversation context fed back into the SDK
- Slash command dispatcher

**Gives us:** chat UX comparable to Copilot CLI, still standalone, still works on CI via existing `pwagent run` path

**Depends on:** Path A working first

### Path C — Squad-compat shim (drop our runtime when Copilot CLI is available)

Ship our charters as `.squad/` files too; let the user choose: standalone (`pwagent run`) or Copilot-CLI-hosted (`copilot --yolo --resume` in a pwagent workspace).

**Effort:** small (4–8 hours). Mostly a packaging change — the charters already work in either shape.
**Gives us:** instant working chat UX (via Copilot CLI), zero new code in pwagent
**Drawback:** advertises the very dependency we deliberately dropped

### Path D — Build our own chat UI (Next.js or Ink)

A full chat surface at `127.0.0.1:7337/chat` inside the portal, or a TUI via Ink. Both expensive.

**Effort:** weeks
**Gives us:** branded chat, full control
**Realistic?** Only if pwagent is going to grow into a Claude Code competitor. For testing-workflow automation, Path B is enough.

### Path E — Stay one-shot, ship harder

Accept that pwagent is a CLI not a chat product. Spend the effort on making `pwagent run --orchestrate` rock solid, the scheduler perfect, the portal rich. ConnectBuddy is for chat; pwagent is for unattended fix loops. Different products.

**Effort:** none — current trajectory
**Gives us:** fewer features, more reliability

---

## 7. My honest take

The user's frustration in showing me ConnectBuddy is fair: it *works* and pwagent *doesn't actually call agents end-to-end right now*. But the comparison isn't apples-to-apples — ConnectBuddy outsources its chat to a third party (Copilot CLI), and the "agent runtime" is whatever model Copilot CLI bundles. pwagent owns its runtime.

**My recommendation:** Path A (fix the SDK auth + surface errors) is non-negotiable and small. After that we have a real choice: stay one-shot (Path E), add a chat REPL (Path B), or ship a Squad shim for the few users who want both (Path C). Path D is a different product altogether.

Right now we have a Ferrari with a misfiring starter motor. Fix the starter before we redesign the car.

---

## 8. Concrete next-step suggestions (if you want them)

Pick one and tell me to do it:

- **"Fix the SDK"** → I run through Path A: refresh the gh token with `copilot` scope, install the Copilot CLI, add SDK error logging, retry the all-13 smoke test.
- **"Add chat"** → I implement Path B: `pwagent chat` REPL with session store + slash commands. Will take longer but gives you the experience you're asking for.
- **"Squad shim"** → I implement Path C: export our charters as `.squad/` files too; you can `copilot --yolo --resume` in pwagent like you do in ConnectBuddy.
- **"Leave it"** → I do nothing on chat; we focus on shipping the orchestrator and unattended loop.

Until you say otherwise, **no further code changes from me.**
