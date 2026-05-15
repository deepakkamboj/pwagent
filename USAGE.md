# Using pwagent — agents, skills, and example prompts

This is the **practical** guide. For architecture and reference material, see [docs/](docs/) or run `npm run dev:docs` and visit `http://127.0.0.1:7338`.

---

## Table of contents

- [Mental model in 60 seconds](#mental-model-in-60-seconds)
- [Invocation patterns](#invocation-patterns)
- [The 13 agents — what to type at each one](#the-13-agents--what-to-type-at-each-one)
- [Skill packs — when each is auto-injected](#skill-packs--when-each-is-auto-injected)
- [End-to-end workflows](#end-to-end-workflows)
- [Working with the portal](#working-with-the-portal)
- [Scheduler recipes](#scheduler-recipes)
- [Tips & gotchas](#tips--gotchas)
- [Migrating from the old 21-agent names](#migrating-from-the-old-21-agent-names)

---

## Mental model in 60 seconds

- **`pwagent` opens the Squad chat shell** — an Ink TUI with PWAGENT banner, categorised agent roster, `@agent` routing, `/` slash-command suggestion box, and streaming responses. Squad (`@bradygaster/squad-cli`) provides the UI; we pass our 13 agents via `.squad/`.
- On first run in a workspace, pwagent scaffolds a **`.pwagent/`** directory (canonical content) from its embedded charters, then mirrors it to **`.squad/`** (Squad CLI reads that path). User edits go in `.pwagent/`; `.squad/` is regenerated on every launch.
- For **CI / scheduled runs**, the headless form `pwagent run <agent>` is still available. It uses pwagent's own coordinator + SDK — no Squad dependency on CI runners.
- Each agent is a Markdown **charter** with stable sections (Identity, Responsibilities, Boundaries, Tools, Model). Read one with `pwagent agents show <name>` from a shell, or use `/agents` inside the chat shell.
- Multi-purpose agents specialize via flags: `fix --scope test|product`, `validate --test|--a11y`, `discover --watch`, `analyze --scenarios|--flakes|--test-quality`, `record --kind matrix|patterns`.
- Skills are **side knowledge** the coordinator injects automatically based on what you typed. You usually don't pick them; you can override with `--skills`.
- Some agents are **gated**: `fix --scope product` won't write to `src/` without a `[p]` stamp; `fix --orchestrate` walks through `review` automatically unless `--auto-stamp` is set.
- All output streams to your terminal and is appended to `~/.pwagent/audit/events.jsonl`.

---

## Invocation patterns

### From chat (daily driver)

`pwagent` spawns `@bradygaster/squad-cli` with `.pwagent/`-loaded agents:

```
pwagent                                       # opens Squad TUI
```

Inside the Squad shell, type free text (supervisor routes it) or address an agent directly with `@`:

```
› fix everything red in pipeline 23878           # free text → supervisor routes to fix
› @pwagent-fix --orchestrate --ado-pipeline 23878  # direct agent addressing
› @pwagent-triage --run-id 89211
› @pwagent-analyze --flakes --pipeline 23878 --top 10
```

Built-in slash commands: `/status`, `/agents`, `/history`, `/clear`, `/help`, `/quit`. Type `/` or `@` to open the suggestion box.

### From the shell (CI / scripts)

```bash
# Named agent — most common
pwagent run <agent> [flags...] [prompt...]

# Let the supervisor pick
pwagent run "<free-text prompt>"

# Run a stamped multi-step flow
pwagent ralph go            # keep the supervisor active until you stop it

# Pin model / mode for one call
pwagent run fix --model claude-opus-4-7 --mode standard --scope test --plan ./plan.json --test "login"

# Override skill-aware injection
pwagent run triage --skills core/flaky-tests,kusto --run-id 12345

# Dry-run (resolve charter + skills, print system prompt, no SDK call)
pwagent run fix --dry-run --orchestrate --ado-pipeline 23878

# Force a workspace
pwagent run analyze --cwd D:/code/my-tests --scenarios --path src/checkout
```

### Global flags (work on every agent)

| Flag | Meaning |
|---|---|
| `--model <id>` | Per-call model override |
| `--mode direct\|light\|standard\|full` | Force a response mode |
| `--cwd <path>` | Resolve workspace overrides from this directory |
| `--dry-run` | Resolve everything, skip the SDK call |
| `--json` | Emit JSON events to stdout instead of streaming markdown |
| `--skills a,b,c` | Replace skill-aware inference with this set |
| `--tool-timeout-s <n>` | Per-tool timeout (default 120) |
| `--idle-timeout-s <n>` | SDK session idle timeout |
| `--skip-gate` | Bypass reviewer gates (dev only — recorded in audit) |

---

## The 13 agents — what to type at each one

Each section shows two invocation styles:
- **`›`** — typed inside the Squad chat shell (`pwagent` with no args)
- **`$`** — run from a terminal / CI script

---

### supervisor — the top-level router

The supervisor consults [`cli/src/content/routing.md`](cli/src/content/routing.md) and delegates. Use it when you don't want to pick an agent yourself. In chat, just type free text — the supervisor is the default handler.

```
› the cart drag-and-drop test failed on run 89211, fix it
  → routes to triage → (HITL stamp) → fix

› what changed in our flake rate this week
  → routes to report

› audit all our test fixtures for missing storage state
  → routes to auth
```

```bash
$ pwagent run "the cart drag-and-drop test failed on run 89211, fix it"
$ pwagent run "what changed in our flake rate this week"
```

---

### discover — find failing tests + (optional) CI daemon

One-shot collection from local runs, ADO Pipelines, GitHub Actions, or Kusto. Add `--watch` for a long-poll daemon that dispatches `triage` on every new failure.

```
› @pwagent-discover --source ado --pipeline 23878
› @pwagent-discover --source kusto --pipeline 23878 --window 7d
› @pwagent-discover --watch
› @pwagent-discover scan GitHub Actions run 12345 in microsoft/playwright-tests for failures
```

```bash
$ pwagent run discover --source local
$ pwagent run discover --source ado --pipeline 23878 --build 4587201
$ pwagent run discover --source github --run-id 12345 --repo microsoft/playwright-tests
$ pwagent run discover --source kusto --pipeline 23878 --window 7d
$ pwagent run discover --watch
$ pwagent run discover --watch --poll-seconds 120 --max-dispatch 10
$ pwagent run discover --watch --status
$ pwagent run discover --watch --stop
```

Output (every mode): `~/.pwagent/runs/<run-id>/failures.json` for downstream agents to consume.

---

### triage — failure classifier

Classifies one failure as `ProductBug` / `TestCodeBug` / `Environment` / `Inconclusive` with a confidence score. **Always start here** when you have a failing test or a red build.

```
› @pwagent-triage --run-id 89211
› @pwagent-triage --artifact ./failures.json
› @pwagent-triage tests/checkout/upsell.spec.ts:23 times out after 30s on click(submit)
```

```bash
$ pwagent run triage --run-id 89211
$ pwagent run triage --artifact ./failures.json
$ pwagent run triage "tests/checkout/upsell.spec.ts:23 times out after 30s on click(submit)"
$ pwagent run triage --example    # canned fixture, no live ADO needed
```

After a verdict is emitted, stamp it with `@pwagent-review` (chat) or `pwagent review` (shell) before invoking fix.

---

### analyze — read-only analyzer (three modes)

Three orthogonal modes; pick exactly one per invocation. **Never mutates code.**

```
› @pwagent-analyze --scenarios --path src/checkout
› @pwagent-analyze --scenarios --min-coverage 70 --fail-on-critical
› @pwagent-analyze --flakes --pipeline 23878 --top 10 --window 30d
› @pwagent-analyze --test-quality --files "tests/checkout/**" --severity-min High
› @pwagent-analyze grade my test quality and file bugs for high-severity findings
```

```bash
$ pwagent run analyze --scenarios
$ pwagent run analyze --scenarios --path src/checkout
$ pwagent run analyze --scenarios --min-coverage 70 --fail-on-critical
$ pwagent run analyze --flakes --pipeline 23878 --top 10 --window 30d
$ pwagent run analyze --flakes --pipeline 23878 --top 5 --format csv -o flakes.csv
$ pwagent run analyze --test-quality --files "tests/**/*.spec.ts"
$ pwagent run analyze --test-quality --files "tests/checkout/**" --severity-min Medium
$ pwagent run analyze --test-quality --files "tests/login.spec.ts" --pr-comment 12345
$ pwagent run analyze --test-quality --files "tests/**/*.spec.ts" --severity-min High --file-bug
```

---

### review — HITL gate

Interactive stamp loop. **Run this between `triage` and `fix`.**

```
› @pwagent-review
› @pwagent-review --list
```

```bash
$ pwagent review                         # interactive
$ pwagent review --list                  # show pending verdicts without stamping
$ pwagent review --batch < stamps.txt    # CI / scripted: one stamp per line
```

Keys: `[p]` ProductBug · `[t]` TestCodeBug · `[s]` Skip · `[o]` Inconclusive

---

### plan — build a fix plan

```
› @pwagent-plan --from-triage 89211
› @pwagent-plan --from-scenario
› @pwagent-plan we have 23 failing tests across checkout and account — group by root cause and order by impact
```

```bash
$ pwagent run plan --failures ./failures.json
$ pwagent run plan --from-triage 89211
$ pwagent run plan --from-scenario
$ pwagent run plan "we have 23 failing tests across checkout and account — group by likely root cause and order by impact"
```

---

### fix — patcher (atomic) + orchestrator (full chain)

**`--scope`** enforces the directory boundary (`tests/` vs `src/`); **`--orchestrate`** runs the full chain.

#### Orchestrator mode — full end-to-end

```
› @pwagent-fix --orchestrate --ado-pipeline 23878
› @pwagent-fix --orchestrate --ado-pipeline 23878 --max-failures 25 --auto-stamp
› @pwagent-fix --orchestrate --bug AB#54321
› @pwagent-fix fix everything red in pipeline 23878 and open PRs
```

```bash
$ pwagent run fix --orchestrate --ado-pipeline 23878
$ pwagent run fix --orchestrate --ado-pipeline 23878 --max-failures 25 --auto-stamp
$ pwagent run fix --orchestrate --ado-build 4587201
$ pwagent run fix --orchestrate --bug AB#54321
$ pwagent run fix --orchestrate --bugs --top 5 --area "OneCRM\\UnifiedClient\\Tests"
```

The chain it runs:

```
discover → triage (fan-out) → review (HITL) → plan → fix --scope <t|p> (fan-out)
  → validate --test → publish → record --kind matrix
```

#### Atomic mode — one patch from a plan

```
› @pwagent-fix --scope test --plan ./fix-plan.json --test "login should redirect"
› @pwagent-fix --from-triage 89211
› @pwagent-fix --diff-only --from-triage 89211
```

```bash
$ pwagent run fix --scope test --plan ./fix-plan.json --test "login should redirect"
$ pwagent run fix --scope product --plan ./fix-plan.json --test "login should redirect"
$ pwagent run fix --scope auto --plan ./fix-plan.json --test "login should redirect"
$ pwagent run fix --from-triage 89211
$ pwagent run fix --bug AB#54321
$ pwagent run fix --diff-only --from-triage 89211
```

---

### validate — twice-runner

```
› @pwagent-validate --test tests/login.spec.ts
› @pwagent-validate --test tests/login.spec.ts --repeat 5
› @pwagent-validate --a11y --bug AB#54321
› @pwagent-validate run the login test twice and tell me if it's flaky
```

```bash
$ pwagent run validate --test tests/login.spec.ts
$ pwagent run validate --test tests/login.spec.ts --repeat 5
$ pwagent run validate --test tests/login.spec.ts --grep "happy path"
$ pwagent run validate --a11y --bug AB#54321
$ pwagent run validate --a11y --bug AB#54321 --url https://app.example.com/login
```

---

### publish — open the PR

ADO uses REST (never `az pr create` — silently strips ArtifactLinks). GitHub uses `gh pr create`. **Never auto-merges.**

```
› @pwagent-publish --branch pwagent/fix/AB54321-fix-login --target main --bug AB#54321
› @pwagent-publish --branch pwagent/author/cart-coupon --target main --reviewer @someone --draft
```

```bash
$ pwagent run publish --branch pwagent/fix/AB54321-fix-login --target main --bug AB#54321 --results ./fix-results.json
$ pwagent run publish --branch pwagent/author/cart-coupon --target main --reviewer @someone --draft
```

---

### author — new-test writer

New tests land in `tests/**/<feature>/<scenario>.generated.spec.ts` with a 7-day probation deadline in the header comment. `review` promotes them out of probation.

```
› @pwagent-author write a test for a logged-in user applying a coupon, seeing the discount, then removing it
› @pwagent-author --from-gap ScenarioGap-0042
› @pwagent-author --coverage-gap "checkout/payment-methods/apple-pay"
```

```bash
$ pwagent run author "logged-in user applies a coupon, sees the discount, removes it"
$ pwagent run author --from-gap ScenarioGap-0042
$ pwagent run author --coverage-gap "checkout/payment-methods/apple-pay"
$ pwagent run author --cwd D:/code/my-tests "add tests for the new orders page using the existing POM"
```

---

### auth — auth-flow specialist

```
› @pwagent-auth --add-role tenant-admin
› @pwagent-auth --refresh-state admin
› @pwagent-auth --diagnose --trace ./failure.zip
› @pwagent-auth our login test fails 20% of the time on the MFA prompt — investigate and propose a fix that doesn't disable MFA in tests
```

```bash
$ pwagent run auth --add-role tenant-admin
$ pwagent run auth --refresh-state admin
$ pwagent run auth --diagnose --trace ./failure.zip
$ pwagent run auth "our login test fails 20% of the time on the MFA prompt — investigate and propose a fix that doesn't disable MFA in tests"
```

---

### record — canonical state writer

Two kinds — both share the append-only contract:

```
› @pwagent-record --kind matrix --op import --source ado --bug-ids 12345,12346
› @pwagent-record --kind matrix --op query --bug AB#54321
› @pwagent-record --kind patterns --from ./fix-results.json
› @pwagent-record link bug AB#54321 to test tests/login.spec.ts in the traceability matrix
```

```bash
$ pwagent run record --kind matrix --op import --source ado --bug-ids 12345,12346,12347
$ pwagent run record --kind matrix --op sync --tests "tests/**/*.spec.ts"
$ pwagent run record --kind matrix --op link --bug AB#54321 --test "tests/login.spec.ts"
$ pwagent run record --kind matrix --op query --bug AB#54321
$ pwagent run record --kind matrix --op decide --test "tests/login.spec.ts" --verdict TestCode --confidence 0.91 --rationale "selector drift"
$ pwagent run record --kind matrix --op stamp --test "tests/login.spec.ts" --stamp t --operator you@example.com
$ pwagent run record --kind matrix --op gap --test "tests/login.spec.ts" --gap ScenarioGap-0042 --severity Medium
$ pwagent run record --kind patterns --from ./fix-results.json
```

---

### report — weekly + ad-hoc reports

```
› @pwagent-report --window 7d
› @pwagent-report --kind flake-rank --pipeline 23878
› @pwagent-report give me a table of every triage verdict for fix-related runs last week with confidence scores
› @pwagent-report what's our scenario coverage trend over the last 30 days
```

```bash
$ pwagent run report
$ pwagent run report --window 30d
$ pwagent run report --since 2026-05-01 --until 2026-05-14
$ pwagent run report --kind weekly
$ pwagent run report --kind flake-rank --pipeline 23878
$ pwagent run report --kind triage --window 7d
$ pwagent run report --kind scenario-coverage
$ pwagent run report "give me a table of every triage verdict for fix-related runs last week, with confidence"
```

---

## Skill packs — when each is auto-injected

You don't pick skills manually. The coordinator scores your prompt against each skill's `description:` frontmatter and injects the top matches. Here's what each pack covers.

| Pack | Auto-injected when you mention… | Sample skills |
|---|---|---|
| `core/` | locators, fixtures, waiting, flakes, mocking, file upload, drag-and-drop, iframes, websockets, visual regression | `locators`, `flaky-tests`, `fixtures-and-hooks`, `clock-and-time-mocking`, `file-upload-download`, `visual-regression`, `iframes-and-shadow-dom` |
| `playwright-cli/` | codegen, traces, devices, request mocking, session management | `core-commands`, `tracing-and-debugging`, `request-mocking`, `session-management`, `test-generation` |
| `ci/` | sharding, projects, artifacts, global setup, reporting | `parallel-and-sharding`, `projects-and-dependencies`, `reporting-and-artifacts`, `global-setup-teardown` |
| `pom/` | page objects, helpers, fixtures vs POM | `page-object-model`, `pom-vs-fixtures-vs-helpers` |
| `kusto/` | flake history, KPI queries, ADO Kusto cluster, **testrun/testresult tables, PowerApps-Engineering cluster** | (Squad-shape — `kusto/SKILL.md`) |
| `ado/` | work items, PRs without `az pr create`, pipeline runs, ArtifactLink | (Squad-shape — `ado/SKILL.md`) |
| `a11y/` | accessibility, axe-core, WCAG, contrast, ARIA | (Squad-shape — `a11y/SKILL.md`) |
| `hitl/` | review queues, stamps, gates | (Squad-shape — `hitl/SKILL.md`) |
| `test-env-auth/` | login flows, OAuth, MFA, storage state | (Squad-shape) |
| `test-review/` | reviewer behaviour, what to look for in test PRs | (Squad-shape) |
| `repo-context/` | which repo, which branch, defaults | (Squad-shape) |

### Forcing a skill (or excluding inferred ones)

```bash
# Force a specific set, replacing the inferred list
pwagent run fix --skills core/locators,core/flaky-tests,ado --from-triage 89211

# Inspect what would be injected
pwagent run fix --dry-run --from-triage 89211 2>&1 | grep -i skill
```

---

## End-to-end workflows

### A — Triage one red build, stamp, fix, ship (manual)

```bash
# 1. Classify
pwagent run triage --run-id 89211

# 2. Stamp (interactive)
pwagent review
#   → [1/1] triage verdict for run 89211
#     verdict: TestCodeBug   confidence: 0.91
#     stamp> t   (TestCodeBug)
#   ✓ stamped.

# 3. Patch + PR
pwagent run fix --from-triage 89211
#   reads stamp, edits tests/upsell.spec.ts, runs validate --test, opens PR via publish
```

### B — Fix everything red in an ADO pipeline (orchestrator)

```bash
# Interactive — pauses at each HITL stamp
pwagent run fix --orchestrate --ado-pipeline 23878

# CI mode — skips HITL (recorded in audit as gateSkipped)
pwagent run fix --orchestrate --ado-pipeline 23878 --auto-stamp --max-failures 25
```

What you'll see at the end (sample):

```
fix --orchestrate --ado-pipeline 23878    (Unified Client — CI Chrome)

discovered     12 failed tests
classified     12   (ProductBug: 3 · TestCodeBug: 7 · Environment: 1 · Inconclusive: 1)
stamped        10   (Inconclusive + Environment skipped)
patched        10   (test: 7 · product: 3)
validated      10   (all two-green)
PRs opened     10
skipped         2   (1 Environment, 1 Inconclusive — awaiting operator)
```

### C — Coverage sweep → fix plan → batch author

```bash
# 1. Find gaps
pwagent run analyze --scenarios --path src/account

# 2. Order them by impact
pwagent run plan --from-scenario

# 3. Author each test the plan calls out
pwagent run author --from-gap ScenarioGap-0042
pwagent run author --from-gap ScenarioGap-0043
pwagent run author --from-gap ScenarioGap-0044
```

You can also let the supervisor chain this: `pwagent run "scan src/account for coverage gaps, build a plan, and start authoring the top 3 tests"` — the supervisor routes into `analyze --scenarios` → `plan` → `author`.

### D — Investigate a flake before deciding what to do

```bash
# Run the suspected flake 5 times locally
pwagent run validate --test tests/checkout/payment.spec.ts --repeat 5

# If truly flaky, ask Kusto for history
pwagent run analyze --flakes --pipeline 23878 --top 10 --window 30d
#   kusto/SKILL.md is injected; uses repos.json → kusto_clusters

# Then triage one of the failures
pwagent run triage --run-id 92110
```

### E — Friday audit cycle

```bash
pwagent run report --window 7d                    # last week
pwagent run analyze --scenarios                    # current coverage gaps
pwagent run plan --from-scenario                   # fix plan for next sprint
```

Or wire those three into the scheduler — see [Scheduler recipes](#scheduler-recipes).

### F — Auth-related diagnosis

```bash
# A login test fails intermittently
pwagent run triage --run-id 92301
# → verdict: TestCodeBug, confidence 0.78

pwagent review            # stamp it [t]

# fix routes through auth on its own based on the artifact contents
pwagent run fix --from-triage 92301

# Or go straight to auth
pwagent run auth --diagnose --trace ./failure.zip
```

### G — Adding a new role across the suite

```bash
pwagent run auth --add-role billing-admin
# → auth proposes:
#     1. tests/setup/billing-admin.setup.ts
#     2. playwright.config.ts project "billing-admin"
#     3. .env / vault key references
#     writes them after you confirm
```

### H — Verify an a11y fix actually moved the numbers

```bash
# Run axe-core against the bug's URL pre- and post-fix; post the diff to the bug
pwagent run validate --a11y --bug AB#54321
```

### I — Grade your test code

```bash
# High-severity findings only, post to a PR
pwagent run analyze --test-quality --files "tests/checkout/**" --severity-min High --pr-comment 9921

# File one bug per rule for medium-and-up findings
pwagent run analyze --test-quality --files "tests/**/*.spec.ts" --severity-min Medium --file-bug
```

---

## Working with the portal

```bash
pwagent portal start                    # http://127.0.0.1:7337
# In a separate shell:
npm run dev:docs                         # http://127.0.0.1:7338 — docs site
```

What the portal is for:

- **`/scheduler`** — start/stop the scheduler, see upcoming runs, watch a live event tail.
- **`/jobs`** — list every scheduled job, click to drill into one, use **"+ New job"** to author a new schedule (writes to `config.json → schedules[]`).
- **`/agents`** — read-only charter browser. Click any card for the full Markdown.
- **`/skills`** — read-only skill browser, grouped by pack.
- **`/audit`** — filter `~/.pwagent/audit/events.jsonl` by type/agent/time, export as `.jsonl` or `.json`.
- **`/config`** — form editor with diff preview for `~/.pwagent/config.json`. Includes a Repos editor (add/remove).
- **`/runs`** — recent `pwagent run` invocations (filtered audit view).
- **`/reports`** — render the weekly Markdown/HTML reports inline.
- **Help** (sidebar bottom + header `?`) — opens the docs site (port 7338) in a new tab.

The portal is **independent** of the CLI. Kill the portal and the CLI + scheduler keep working.

---

## Scheduler recipes

Jobs live in `squad.schedule.json` at the project root and are picked up automatically by `@bradygaster/squad-scheduler`. Each job uses a standard 5-field cron expression (`minute hour dom month dow`).

### Recipe 1 — Triage new failures every 5 min during business hours

```json
{
  "id": "triage-poll",
  "name": "Triage Poll",
  "description": "Poll for new failures and auto-dispatch triage during business hours.",
  "cron": "*/5 9-17 * * 1-5",
  "agent": "discover",
  "args": "--watch --once",
  "enabled": true,
  "maxRunSeconds": 300,
  "retryOnFailure": false
}
```

### Recipe 2 — Nightly coverage sweep at 02:00

```json
{
  "id": "nightly-coverage",
  "name": "Nightly Coverage Sweep",
  "description": "Find scenario gaps every night.",
  "cron": "0 2 * * *",
  "agent": "analyze",
  "args": "--scenarios --path src",
  "enabled": true,
  "maxRunSeconds": 1800,
  "retryOnFailure": true,
  "maxRetries": 2,
  "retryBackoffSeconds": 60
}
```

### Recipe 3 — Nightly flake rank at 03:00

```json
{
  "id": "nightly-flake-rank",
  "name": "Nightly Flake Rank",
  "description": "Rank flaky tests via Kusto over the last 14 days.",
  "cron": "0 3 * * *",
  "agent": "analyze",
  "args": "--flakes --pipeline 23878 --top 20 --window 14d --format json",
  "enabled": true,
  "maxRunSeconds": 1800,
  "retryOnFailure": true,
  "maxRetries": 2,
  "retryBackoffSeconds": 60
}
```

### Recipe 4 — Weekly report Fridays 17:00

```json
{
  "id": "weekly-report",
  "name": "Weekly Report",
  "description": "Weekly Markdown + HTML report.",
  "cron": "0 17 * * 5",
  "agent": "report",
  "args": "--window 7d",
  "enabled": true,
  "maxRunSeconds": 900,
  "retryOnFailure": true,
  "maxRetries": 1,
  "retryBackoffSeconds": 120
}
```

### Recipe 5 — Auto-fix red CI every 15 min on weekdays

```json
{
  "id": "business-hours-fix",
  "name": "Business Hours Fix",
  "description": "Every 15 min on weekdays 9-17, fix up to 5 failures from the pipeline.",
  "cron": "*/15 9-17 * * 1-5",
  "agent": "fix",
  "args": "--orchestrate --ado-pipeline 23878 --max-failures 5 --auto-stamp",
  "enabled": true,
  "maxRunSeconds": 900,
  "retryOnFailure": true,
  "maxRetries": 2,
  "retryBackoffSeconds": 60
}
```

For shell commands use `"command"` instead of `"agent"`, e.g. `"command": "node scripts/report.mjs"`.

Manage them:

```bash
pwagent scheduler start          # start scheduler (reads squad.schedule.json in cwd)
pwagent scheduler stop           # signal running scheduler to stop
pwagent scheduler list           # all jobs + next fire time
pwagent scheduler status [id]    # overall status or detail for one job
pwagent scheduler logs <id>      # tail JSONL event log for a job
```

Or use the portal at `/scheduler` and `/jobs`.

---

## Tips & gotchas

### Don't skip the stamp

`fix --scope product` refuses without a `[p]` stamp. `fix --orchestrate` walks through `review` automatically (or skips with `--auto-stamp`, logged in audit). For one-off CI runs, `--skip-gate` is the explicit escape hatch — recorded in audit so it's visible.

### Workspace overrides win

Drop a `.pwagent/agents/triage/charter.md` in your repo to override the embedded triage charter for that workspace only. Same for skills under `.pwagent/skills/`. Works for `.squad/` directories too (we treat them as fallback). Verify which layer won:

```bash
pwagent agents show triage --source
```

### Skill-aware injection is fuzzy — override when it picks wrong

```bash
# Inspect what would be injected
pwagent run triage --dry-run --run-id 12345 2>&1 | head -40

# Replace the inferred set
pwagent run triage --skills core/flaky-tests,kusto --run-id 12345
```

### Two windows: terminal for actions, portal for visibility

The CLI is the right tool when you know what you want to do. The portal is the right tool for *watching* — log tails, audit filters, recent runs. They share the same state on disk.

### Cost vs latency

Heavy `--mode full` calls (weekly reports, `fix --orchestrate` on large pipelines) cost more. Use `--mode light` for single-file edits. The coordinator picks one of `direct / light / standard / full` automatically; only override when you have a reason.

### Where to find the actual charter/skill text

```bash
pwagent agents list                            # one line per agent
pwagent agents show fix                         # full charter
pwagent agents show fix --raw                   # without rendering frontmatter

pwagent skills list                             # all packs
pwagent skills list --pack core                 # one pack
pwagent skills show core/flaky-tests            # full skill
pwagent skills show kusto                       # Squad-shape (implicit SKILL.md)
```

### Air-gapped / no-network usage

The charters and skills are **embedded in the binary** — they don't need network access. The only network call pwagent itself makes is to the GitHub Copilot endpoint via `@github/copilot-sdk`. If that's unreachable, `pwagent doctor` will tell you (`copilot probe [✗]`).

### Audit everything

Every run, every tool call, every stamp lands in `~/.pwagent/audit/events.jsonl`. Tail it live:

```bash
pwagent audit tail
pwagent audit export --since 24h --type run.error
```

Or browse in the portal at `/audit`.

### Kusto clusters and tables

The `repos.json → kusto_clusters` block (mirrored in `config.json → kustoClusters`) registers three clusters:

- **`1es`** — `https://1es.kusto.windows.net`, db `AzureDevOps` — default for `analyze --flakes`
- **`aria`** — `https://ariav2.kusto.windows.net`, db `AriaBridge` — generic Aria v2 bridge
- **`powerapps-engineering`** — `https://kusto.aria.microsoft.com`, db `9e3b07ee31d44eb9aba317884f5e8ad4` — PowerApps test telemetry; primary tables: `testrun` (per-run) and `testresult` (per-individual-outcome)

Discover any table's schema first:

```kql
cluster('kusto.aria.microsoft.com').database('9e3b07ee31d44eb9aba317884f5e8ad4').testrun | getschema
```

The `kusto/SKILL.md` skill has a ready-to-run flake-rank query that joins `testresult` to `testrun` against the PowerApps-Engineering cluster. See [cli/src/content/skills/kusto/SKILL.md](cli/src/content/skills/kusto/SKILL.md).

---

## Migrating from the old 21-agent names

We consolidated 21 → 13 in May 2026. Argument flags replaced specialist agent names; behavior is identical.

| Old invocation | New invocation |
|---|---|
| `pwagent run monitor start` | `pwagent run discover --watch` |
| `pwagent run runner ado --pipeline N` | `pwagent run discover --source ado --pipeline N` |
| `pwagent run scenario` | `pwagent run analyze --scenarios` |
| `pwagent run kusto-fix rank --pipeline N --top N` | `pwagent run analyze --flakes --pipeline N --top N` |
| `pwagent run test-reviewer --files G` | `pwagent run analyze --test-quality --files G` |
| `pwagent run test-fix apply --plan P --test T` | `pwagent run fix --scope test --plan P --test T` |
| `pwagent run product-fix apply --plan P --test T` | `pwagent run fix --scope product --plan P --test T` |
| `pwagent run heal --from-triage N` | `pwagent run fix --from-triage N` |
| `pwagent run ado-fix pipeline --id N` | `pwagent run fix --orchestrate --ado-pipeline N` |
| `pwagent run validate FILE` | `pwagent run validate --test FILE` |
| `pwagent run a11y-verifier verify --bug N` | `pwagent run validate --a11y --bug N` |
| `pwagent run matrix import --bug-ids 1,2,3` | `pwagent run record --kind matrix --op import --bug-ids 1,2,3` |
| `pwagent run learner extract --results R` | `pwagent run record --kind patterns --from R` |
| `pwagent run pr-creator create --branch X` | `pwagent run publish --branch X` |
| `pwagent run generate --scenario "..."` | `pwagent run author --scenario "..."` |

---

## Where to go deeper

- **[docs/](docs/)** — full docs site (run `npm run dev:docs` → http://127.0.0.1:7338)
- **[README.md](README.md)** — architecture, design rationale, technology stack, the comprehensive agent+args reference table
- **[cli/src/content/agents/](cli/src/content/agents/)** — read the 13 charters directly
- **[cli/src/content/skills/](cli/src/content/skills/)** — read the skill guides directly
- **[cli/src/content/routing.md](cli/src/content/routing.md)** — see exactly how the supervisor decides where to route
- **[cli/src/content/team.md](cli/src/content/team.md)** — the canonical roster

The docs site has dedicated pages for each agent ([/agents/fix](http://127.0.0.1:7338/agents/fix), etc.) with charter explanations, required stamps, sample outputs, and source links.
