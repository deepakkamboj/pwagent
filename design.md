# pwagent — chat-first UX design (GitHub Copilot CLI parity)

> Spec for the next iteration. **No code shipped against this yet — review before implementing.**
>
> Goal: `pwagent` becomes a chat surface with the same look and feel as **GitHub Copilot CLI** / **Claude Code** / **ConnectBuddy** (which runs *inside* Copilot CLI). Free text routes via the supervisor; slash commands invoke any agent directly. Existing `pwagent run <agent>` survives, but only as the **CI/automation** path — not the daily-driver workflow.

---

## Table of contents

- [Locked-in decisions](#locked-in-decisions)
- [Reference: what Copilot CLI looks like](#reference-what-copilot-cli-looks-like)
- [What pwagent will look like](#what-pwagent-will-look-like)
- [Render conventions (visual primitives)](#render-conventions-visual-primitives)
- [Slash commands — Copilot CLI's set, adapted](#slash-commands--copilot-clis-set-adapted)
- [Autonomous routing — how it works](#autonomous-routing--how-it-works)
- [What `pwagent run` becomes](#what-pwagent-run-becomes)
- [File-level plan](#file-level-plan)
- [Things deliberately punted on](#things-deliberately-punted-on)
- [Open question for ratification](#open-question-for-ratification)

---

## Locked-in decisions

| # | Decision |
|---|---|
| 1 | **Autonomous routing.** Free text inside chat goes to the supervisor's long-lived SDK session. The supervisor uses a new `dispatch_to_agent` tool to call specialists directly. No "would you like me to run X?" confirm step. |
| 2 | **Chat is the only daily-driver entry.** `pwagent` (no args, TTY stdin) drops straight into chat. `pwagent chat` is an alias. `pwagent run <agent>` stays for CI but is not how humans use the tool day-to-day. |
| 3 | **Banner every time chat opens.** Rainbow ASCII (already exists in `cli/src/utils/banner.ts`). |
| 4 | **100% Copilot CLI visual parity.** Pink dots for agent narration / tool calls, indented dim sub-lines for tool results, `✔` for completion markers, `›` prompt symbol (U+203A), bottom status line with version + model + slash-command hints. |
| 5 | **Naming is open — what matters is the UX.** Internal architecture can be called anything; surface should be indistinguishable from Copilot CLI to a user squinting at the terminal. |

---

## Reference: what Copilot CLI looks like

Captured from the ConnectBuddy screenshot:

```
● Read period-summary-6-activities.md
   .squad\connect\2026\period-summary-6-activities.md
   30 lines read
● Read CONNECT-CONTEXT.md
   .squad\connect\2026\CONNECT-CONTEXT.md
   L1:60 (60 lines read)
● The new draft reads cleanly, and I'm closing out the tracked Connect tasks now.
✔Todo completed 3 items
      connect-2026-six-activities-draft
      connect-2026-six-activities-summary
      connect-2026-six-activities-verify
● Done — I created the new 2026 Connect docs with the 4 OKRs + 2 vendor engagements framing:

      - .squad\connect\2026\drafts\connect-2026-six-activities.md
      - .squad\connect\2026\period-summary-6-activities.md

  I also refreshed the Connect context to match that structure and pulled in the latest W19/W20 evidence.

D:\gith\ConnectBuddy  [⤴main%]

›

v1.0.48 available · run /update · / commands · ? help                GPT-5.4 mini
```

Key conventions reverse-engineered:

- `● ` (pink/magenta) precedes every agent action, tool call, and narration paragraph.
- Tool result details indent 3 spaces and render dim.
- `✔` precedes a phase-completion summary in bold.
- Deeply-indented bulleted lists (6 spaces) for file references / output items.
- Trailing narrative renders as plain text indented 2 spaces.
- A dim line above the prompt shows working directory + git branch state.
- The prompt symbol is `›` (RIGHT-ANGLE QUOTATION MARK, U+203A), not `>`.
- A bottom info bar shows version + slash-command hints on the left, model name on the right (justified).

---

## What pwagent will look like

Example session — user types "fix everything red in pipeline 23878":

```


  ██████╗  ██╗    ██╗  █████╗   ██████╗ ███████╗███╗   ██╗████████╗
  ██╔══██╗ ██║    ██║ ██╔══██╗ ██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝
  ██████╔╝ ██║ █╗ ██║ ███████║ ██║  ███╗█████╗  ██╔██╗ ██║   ██║
  ██╔═══╝  ██║███╗██║ ██╔══██║ ██║   ██║██╔══╝  ██║╚██╗██║   ██║
  ██║      ╚███╔███╔╝ ██║  ██║ ╚██████╔╝███████╗██║ ╚████║   ██║
  ╚═╝       ╚══╝╚══╝  ╚═╝  ╚═╝  ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝

  Multi-agent Playwright testing — Squad design, GitHub Copilot SDK runtime.


› fix everything red in pipeline 23878

● Routing to fix agent for ADO pipeline orchestration.
● dispatch_to_agent  fix
   args  --orchestrate --ado-pipeline 23878
   model claude-sonnet-4.5

● Read failures.json
   ~/.pwagent/runs/run_1747260…/failures.json
   12 entries

● Classifying 12 failures (parallel fan-out → triage)
   triage  run 89211  ProductBug   0.84
   triage  run 89212  TestCodeBug  0.91
   ... 10 more

✔ Stamped 10, skipped 2 (Environment + Inconclusive)

● Plan built, 10 entries

● Patching (test-fix: 7, product-fix: 3)
   test-fix  tests/checkout/upsell.spec.ts        +12 -4 lines
   test-fix  tests/cart/coupon.spec.ts            +6 -3 lines
   ... 8 more

● Validating each patch (npx playwright test ×2 each)
   validate  tests/checkout/upsell.spec.ts        ok ok    (47s)
   ... 9 more

● PRs opened
      - https://dev.azure.com/dynamicscrm/.../pullrequest/14721
      - https://dev.azure.com/dynamicscrm/.../pullrequest/14722
      ... 8 more

✔ Done — 10 fixes shipped, 2 awaiting operator

D:\gith\CRM.Client.UnifiedClient  [main]

›

v0.1.0   ·   / commands   ·   ? help                                claude-sonnet-4.5
```

---

## Render conventions (visual primitives)

All output goes through a small set of helpers in `cli/src/cli/chat-render.ts` (new file):

```ts
dot(text)              →  "● " + bright + text
done(text)             →  "✔ " + bold + text
subline(text)          →  "   " + dim + text                   // 3-space indent, dim
deepBullet(text)       →  "      - " + dim + text              // 6-space indent, dim
narrate(text)          →  "   " + text                         // trailing paragraph body
envLine(cwd, branch)   →  ""    + dim + cwd + "  [" + branch + "]"
prompt()               →  "› "  + reset
statusBar(model, ver)  →  dim line: "v<ver>  ·  / commands  ·  ? help" + padding + model
```

### Mapping SDK events → renderer calls

| SDK event | Renderer output |
|---|---|
| `assistant.message_delta(x)` | dot-prefixed paragraphs, soft-wrapped to terminal width |
| `tool.execution_start(read)` | `● Read <path>` |
| `tool.execution_complete(read)` | `subline("X lines read")` |
| `tool.execution_start(write)` | `● Write <path>` |
| `tool.execution_complete(write)` | `subline("X lines written")` |
| `tool.execution_start(edit)` | `● Edit <path>` |
| `tool.execution_complete(edit)` | `subline("+N -M lines")` |
| `tool.execution_start(bash)` | `● Bash $ <cmd>` |
| `tool.execution_complete(bash)` | `subline("exit " + code + " · " + dur + " · " + first/last lines)` |
| `tool.execution_start(dispatch_to_agent)` | `● dispatch_to_agent  <agent-name>` + subline args + subline model |
| `tool.execution_complete(dispatch_to_agent)` | streamed sub-agent output is re-rendered through same helpers |
| `session.idle` | blank line, then envLine, blank line, prompt, statusBar (cursor-up to keep bar at bottom) |

---

## Slash commands — Copilot CLI's set, adapted

| Copilot CLI | pwagent | What it does |
|---|---|---|
| `/help` | `/help` | Show command list grouped by category |
| `/clear` | `/clear` | Clear screen + redraw banner |
| `/quit`, `/exit` | `/quit`, `/exit` | Disconnect SDK, exit |
| `/login` | `/login` | Runs `pwagent login` (wraps `gh auth login --web`) |
| `/update` | *(omitted — no update channel yet)* | — |
| *(none)* | `/agents` | List the 13 agents |
| *(none)* | `/agent <name>` | Switch active agent (rebuilds the long-lived session) |
| *(none)* | `/<agent-name> [args]` | One-shot specialist call (e.g. `/fix --orchestrate ...`) — bypasses the supervisor's routing |
| *(none)* | `/model <id>` | Change model for the active session |
| *(none)* | `/mode direct\|light\|standard\|full` | Change response mode hint |
| *(none)* | `/skills` | Show injected skills for the current active agent |
| *(none)* | `/session`, `/resume <id>`, `/list-sessions` | Session management |
| *(none)* | `/cwd <path>` | Change tool working directory |
| *(none)* | `/doctor` | Inline `pwagent doctor` (auth + prereqs check) |

Typing `/` alone with no command surfaces a one-line hint (autocomplete dropdown is a future enhancement, see [Things deliberately punted on](#things-deliberately-punted-on)).

---

## Autonomous routing — how it works

This is option (b) from earlier discussion: supervisor decides and dispatches without asking permission.

### The dispatch tool

A new tool registered only inside chat sessions:

```ts
{
  name: "dispatch_to_agent",
  description: "Run a pwagent specialist for a sub-task and return their full text output. Use when the user's request belongs to a named specialist agent (triage/fix/analyze/etc).",
  inputSchema: {
    type: "object",
    properties: {
      agent:  { type: "string", description: "Specialist agent name." },
      prompt: { type: "string", description: "The prompt to send to that specialist." },
      mode:   { type: "string", enum: ["direct","light","standard","full"], default: "standard" },
    },
    required: ["agent", "prompt"],
  },
  // Handler is a closure over coordinator.invoke()
  async run({ agent, prompt, mode }, ctx) {
    const result = await invoke({ agent, prompt, mode, cwd: ctx.cwd });
    return result.output ?? "(no output)";
  },
}
```

Only injected into the chat REPL's session. `pwagent run <agent>` (CI path) does NOT see this tool — it's a chat-only construct.

### Supervisor charter change

Add to [cli/src/content/agents/supervisor/charter.md](cli/src/content/agents/supervisor/charter.md):

```markdown
## Behavior

When the user's request belongs to one of the 13 specialists (see the roster
table above), call `dispatch_to_agent(agent, prompt)` and return the specialist's
output verbatim. Don't editorialize. Don't summarize unless the user explicitly asks.

For ambiguous requests, pick the most specific match. For multi-step requests
("fix everything red in pipeline N"), prefer `fix --orchestrate` over chaining
individual stages.

You handle quick conversational turns (clarifications, "what does X mean", status
questions about the chat session itself) directly without dispatching.
```

And in the supervisor's `## Tools` block, add the new tool:

```
## Tools

- `read` (charters, routing.md)
- `dispatch_to_agent` (route work to specialists; chat sessions only)
```

### What the user actually sees

User: `> fix everything red in pipeline 23878`

→ supervisor session receives it
→ supervisor's model decides to dispatch
→ tool call event emitted: `● dispatch_to_agent  fix`  + `   args  --orchestrate --ado-pipeline 23878`
→ fix agent invoke runs (full chain, parallel fan-out, etc.)
→ fix agent's streamed output renders through the same renderer
→ supervisor's session sees the tool result, may add a closing remark or stay silent
→ prompt returns

---

## What `pwagent run` becomes

**Stays. Documented as CI-only. De-emphasised in human-facing docs.**

- `cli/src/cli/run.ts` — no code changes (it works)
- README — moved to a "CI integration" subsection below the chat docs
- USAGE — moved to a "Running pwagent unattended" appendix
- Scheduler job specs in `~/.pwagent/scheduler/*.json` still use `pwagent run` in their `command` field — no change

Concretely the human workflow becomes:

```
# Daily driver — type to chat:
pwagent

# CI — same coordinator, same SDK, no chat UI:
pwagent run fix --orchestrate --ado-pipeline 23878 --auto-stamp --json
```

---

## Bootstrap & health — how `init`, `doctor`, `login` work in chat-first world

Three problems any chat-first CLI has to solve:

1. **First run** — user just installed pwagent, no `~/.pwagent/config.json`, possibly no `gh auth`. Dropping them into chat would fail at the SDK step.
2. **Stale state** — token expired, ADO org changed, missing prereq. Doctor needs to surface this without forcing the user to leave chat.
3. **Reconfigure** — user wants to swap default model, add a repo, point at a different ADO org.

Solution: **keep the existing subcommands AND surface them as slash commands inside chat, with an auto-health-check on chat startup.**

### Three modes

| Path | Used when | What happens |
|---|---|---|
| `pwagent init` *(subcommand)* | Brand-new install, scripted environments, or user doesn't want to open chat first | Interactive setup wizard (uses `prompts`); writes `~/.pwagent/config.json`; exits |
| `pwagent doctor` *(subcommand)* | Debugging, CI, scripted health checks, returning exit codes for shell scripts | Runs full health check, prints categorised report, exits 0 only if everything required is green |
| `/init`, `/doctor`, `/login` *(slash commands inside chat)* | Daily-driver case — already in chat and discover an issue | Same underlying functions; output rendered inline through the Copilot-style renderer; chat continues after |

**The implementation is shared.** `cli/src/cli/init.ts` and `cli/src/cli/doctor.ts` export their core logic as functions; the slash commands and the subcommands both call those functions. No duplicated code.

### Startup health check (the most important new behaviour)

When `pwagent` opens chat, before showing the first `›` prompt, run a **fast non-blocking probe**:

```
[banner rendered]

✓ ready  ·  v0.1.0  ·  claude-haiku-4.5  ·  D:\gith\CRM.Client.UnifiedClient  [main]

›
```

Or, if something's amiss:

```
[banner rendered]

✗ doctor: 2 required prereqs missing (axe, kusto)
  Type /doctor for details · /init to reconfigure · /login if your token is stale

›
```

The probe is **fast (< 1s)** and **never blocks** — if it can't complete in 800ms, render `…checking` and let the user start chatting anyway. The probe checks:

- `~/.pwagent/config.json` exists and parses
- gh auth is logged in (no API call, just reads gh's keychain status)
- Required prereqs detected (cached from last `pwagent doctor` run if recent, else fast `which` probe)
- Copilot SDK is loadable (does NOT call `client.start()` — that's slow and runs lazily on first turn)

If config doesn't exist at all (truly first run), skip the probe and show the welcome path below.

### First-run welcome

When `~/.pwagent/config.json` doesn't exist:

```
[banner rendered]

  Welcome to pwagent.
  This is your first time — let's get set up.

  Type /init to configure (one-time, ~30 seconds)
  Or /doctor to check what's missing before configuring

›
```

The user can still chat without configuring (the supervisor doesn't need ADO or repos to answer questions), but any specialist that needs those will hit a clear error and route them back to `/init`.

### `/doctor` — inline health check

Renders Copilot-style:

```
› /doctor

● Running doctor checks

✔ binary version 0.1.0
✔ 13 charters embedded
✔ 61 skills embedded
✔ config  ~/.pwagent/config.json
✔ provider github-copilot-sdk (claude-haiku-4.5)
✔ copilot probe reachable (812ms)

● prerequisites
   required     node ≥22 ✓  ·  git ✓  ·  gh ✓  ·  gh auth ✓  ·  az ✓  ·  az pipelines ext ✓
                @axe-core/cli ✗  ·  kusto CLI ✗
   recommended  playwright ✓  ·  playwright browsers ✗
   optional     VS Code ✓

● features
   test execution    available
   ADO triage        available
   ADO PRs           available
   GitHub PRs        available
   GitHub Issues     available
   a11y verify       disabled  (missing: axe)
   flake finder      disabled  (missing: kusto)

✗ 2 required prereqs missing

   Run /doctor --fix to install them
   Or run them manually: npm install -g @axe-core/cli  ·  follow aka.ms/kustofree

›
```

**Behaviour:**

- Same checks as `pwagent doctor` today
- Output goes through `chat-render.ts` primitives (`dot`, `done`, `subline`)
- Doesn't disconnect the chat session — the user picks back up afterward
- `/doctor --fix` → equivalent to `pwagent prereqs --install --yes` — shows install progress inline
- `/doctor --no-probe` → skip the Copilot SDK reachability check (fast, ~200ms instead of 5s)

### `/init` — interactive reconfigure

Init has interactive prompts that take over stdin temporarily. Solution: **pause readline**, **run init's prompts() flow**, **resume readline** when it returns.

```
› /init

● pwagent setup

? Default model:           ❯ claude-sonnet-4.5
                             claude-haiku-4.5
                             claude-opus-4.5
                             gpt-5-mini

? ADO organization URL:    https://dynamicscrm.visualstudio.com
? ADO project:             OneCRM
? Default repo:            CRM.Client.UnifiedClient

? Add a repo? (Y/n)        y
?   Name:                  CRM.Client.UnifiedClient
?   Path:                  D:\gith\CRM.Client.UnifiedClient
?   Type:                  ado
?   Default branch:        main
? Add another repo? (y/N)  n

? Enable scheduler? (y/N)  n

✔ Wrote ~/.pwagent/config.json

›
```

**Behaviour:**

- Same prompts as `pwagent init` today (defined in `cli/src/cli/init.ts`)
- Atomic write to `~/.pwagent/config.json` (write tmp + rename)
- Returns to chat prompt — supervisor doesn't need to be restarted because the config is reloaded on the next specialist dispatch
- `/init --yes` → accept all defaults non-interactively (useful for scripted/onboarding)
- After completion: silent re-probe runs, status line updates

### `/login` — gh auth flow

```
› /login

● Opening gh auth flow

   First copy your one-time code: E923-5669
   Then visit https://github.com/login/device

   (Waiting for browser confirmation…)

✔ Logged in as deepakkamboj

›
```

**Behaviour:**

- Wraps `gh auth login --web --scopes read:user` (same as `pwagent login`)
- Readline paused while gh's interactive flow runs
- After completion: silent re-probe runs to confirm
- `/logout` similarly wraps `gh auth logout`

### How interactive prompts work inside the REPL

The chat REPL uses `readline/promises`. Init / login / interactive review etc. need their own stdin/stdout. Pattern:

```ts
async function runModal<T>(fn: () => Promise<T>): Promise<T> {
  rl.pause();          // stops readline from consuming stdin
  try {
    return await fn();  // init / prompts / gh auth runs with full stdin/stdout access
  } finally {
    rl.resume();        // chat takes the prompt back
    redrawPromptLine();
  }
}
```

This is one helper, reused for `/init`, `/login`, `/logout`, `/review` (HITL stamp loop), `/doctor --fix` (which runs `winget install` / `gh extension install` etc. and shows progress).

### Standalone subcommands still work

For CI / scripted use cases, the subcommands stay exactly as they are:

```bash
pwagent init --yes                             # non-interactive bootstrap (CI provisioner)
pwagent doctor                                  # exits 0 only if everything's green
pwagent doctor --no-probe                       # skip the SDK probe (faster)
pwagent prereqs --install --yes                 # install missing prereqs
pwagent login                                   # gh auth flow
pwagent whoami                                  # current user + copilot status
```

None of these change. They're the API a Docker image or onboarding script calls.

### Feature flag — Copilot probe behaviour

The current doctor probe times out after 5s by default. We saw earlier that the live SDK takes ~10s to connect on this machine. Two related changes:

1. **Default probe timeout: 5s** (unchanged) — fast, used by startup health check and `/doctor`
2. **Default connect timeout for runs: 20s** (unchanged) — already shipped in Path A
3. **`/doctor --probe-timeout-ms N`** flag — for users on slow proxies to extend the probe specifically without changing run behaviour

### Startup-time decision tree (pseudocode)

```ts
async function startChat() {
  showBanner();

  if (!configExists()) {
    showFirstRunWelcome();
    enterChat({ greenLight: false });   // chat works for casual Q&A
    return;
  }

  const probeResult = await fastProbe({ timeoutMs: 800 });
  if (probeResult.allGreen) {
    showStatusLine("✓ ready · " + model + " · " + cwd + " [" + branch + "]");
    enterChat({ greenLight: true });
  } else {
    showStatusLine(`✗ doctor: ${probeResult.summary}`);
    showHint("Type /doctor for details · /init to reconfigure · /login if your token is stale");
    enterChat({ greenLight: false });
  }
}
```

`greenLight` controls whether the supervisor's `dispatch_to_agent` calls are auto-approved or whether they show a confirm prompt. In `greenLight: false` mode, the dispatch tool requires a `y/n` for each specialist call so the user can't accidentally fire an unconfigured run.

---

## File-level plan

| File | Change | Approx lines |
|---|---|---|
| `cli/src/cli/chat-render.ts` *(new)* | All visual primitives — dot/done/subline/deepBullet/narrate/envLine/prompt/statusBar | +180 |
| `cli/src/cli/chat.ts` | Replace ad-hoc renderer with chat-render primitives; agent-name slash commands; banner + envLine + statusBar; inject dispatch tool | +400 / -100 |
| `cli/src/runtime/dispatch.ts` *(new)* | `makeDispatchTool(cwd)` factory closured over `coordinator.invoke()` | +60 |
| `cli/src/runtime/provider.ts` | Pass tool arg + duration metadata to events so renderer has what it needs | +30 |
| `cli/src/content/agents/supervisor/charter.md` | Add `dispatch_to_agent` to Tools; add `## Behavior` section | +30 / -5 |
| `cli/src/index.ts` | `pwagent` (no args + TTY) → chat | +15 |
| `README.md` | Restructure Usage: chat-first up top, `pwagent run` documented at the bottom as CI | +100 / -50 |
| `USAGE.md` | Same restructure — slash-command examples replace `pwagent run` examples; CI section appendix at the end | +50 / -30 |

**Total:** ~870 lines added, ~185 removed. **One commit.**

---

## Things deliberately punted on

These would push us past Copilot CLI parity into "better" territory. Worth doing later, not in this round:

| Feature | Why deferred |
|---|---|
| **Persistent bottom status bar** that stays visible while output streams above it | Needs ANSI cursor save/restore + a stream interceptor. ~200 extra lines, fragile on Windows Terminal under certain rendering modes. Current design prints the bar after each turn, which is "good enough" for parity. |
| **`/` autocomplete dropdown** (typing `/` shows a filterable list) | Needs Ink (React for CLIs) or raw ANSI cursor work. Out of scope for first cut. |
| **Up-arrow history across sessions** | Would need a separate history file at `~/.pwagent/history.txt`. Readline already does in-session history for free. |
| **Multi-line input** with `Esc+Enter` for newline | Readline can do this but has known Windows quirks. Defer. |
| **Markdown syntax highlighting** of streamed assistant output | Requires a streaming markdown renderer. Defer until we know users care. |
| **`/` followed by partial agent name → fuzzy match** | Nice but not required. Defer. |
| **Theme support** (other than the rainbow banner) | Defer until someone asks. |

---

## Open question for ratification

Three things I'd like a yes/no on before starting:

1. **Persistent bottom status bar:** punt to round 2? *(my recommendation: yes — defer)*
2. **`pwagent chat` as an alias:** keep `pwagent chat` working alongside `pwagent`? *(my recommendation: yes — second alias is free and helpful in docs)*
3. **Default model for the supervisor's chat session:** `claude-haiku-4.5` (cheap router) or `claude-sonnet-4.5` (smarter routing decisions)? *(my recommendation: haiku — the supervisor's job is light, specialists do the heavy work via dispatch)*

Default answers: yes / yes / haiku. Tell me to flip any of them.

---

## Acceptance criteria

When this is shipped, the following must be true:

- [ ] `pwagent` with no args + TTY stdin drops into chat with the rainbow banner
- [ ] `pwagent chat` does the same
- [ ] `pwagent --help` still prints help
- [ ] `pwagent run fix --orchestrate --ado-pipeline N` still works (CI path)
- [ ] In chat: typing `fix everything red in pipeline 23878` → supervisor dispatches to fix agent → fix runs → output streams back
- [ ] In chat: typing `/fix --orchestrate --ado-pipeline 23878` → fix agent runs directly (no supervisor in the loop)
- [ ] In chat: every tool call renders as `● Tool <arg>` + indented dim subline
- [ ] In chat: every phase completion renders as `✔ <summary>` in bold
- [ ] In chat: prompt is `› ` (U+203A)
- [ ] In chat: above the prompt, dim line shows cwd + git branch
- [ ] In chat: below the prompt, dim status bar shows `v<ver> · / commands · ? help` + model name
- [ ] Session persisted to `~/.pwagent/sessions/<id>.jsonl`
- [ ] `/resume <id>` loads a prior session and replays user turns
- [ ] `/help` lists every command grouped by category
- [ ] Banner is the rainbow ASCII art from `cli/src/utils/banner.ts`
- [ ] `pwagent run` is documented as CI-only in README + USAGE; chat is the daily-driver section

---

## Out-of-design notes (history / context)

- The repo today has 13 consolidated agents (analyze, auth, author, discover, fix, plan, publish, record, report, review, supervisor, triage, validate) — see [README.md](README.md) and [USAGE.md](USAGE.md).
- Path A (SDK adapter fix) is shipped — commit `c6cacf4`. Live agent calls work end-to-end.
- Path B (raw chat REPL) is shipped — commit `8e492a9`. Provides the bones (sessions, slash commands, multi-turn) that this design extends.
- This design (chat-first, Copilot CLI parity) is the **third** iteration on the UX and the one we'd ship as the default daily-driver.
- See [gaps.md](gaps.md) for the original analysis of pwagent vs. ConnectBuddy that led here.
