# Routing

> Coordinator routing rules and reviewer gates. Edit at `~/.pwagent/routing.md` (user override) or `<workspace>/.pwagent/routing.md` (workspace override, preferred) or `<workspace>/.squad/routing.md` (Squad-compat fallback).

## Work routing

| Work Type | Route To | Examples |
|---|---|---|
| **End-to-end ADO fix** | `fix --orchestrate --ado-pipeline N` | "fix everything red in pipeline 23878", "run the full loop on this build", "patch all failures from yesterday's CI" |
| CI failure watching | `discover --watch` | "start monitoring pipelines", "poll ADO for new failures", "is the monitor running" |
| Failure discovery (one-shot) | `discover --source X` | "discover failures from run 12345", "pull failures.json from this build", "list failed tests locally" |
| Failure classification | triage | "classify run 12345", "what kind of bug is this" |
| Flake ranking | `analyze --flakes --pipeline N` | "top 10 flakes in pipeline 23878", "rank flaky tests over 30 days" |
| Coverage analysis | `analyze --scenarios` | "find missing scenarios", "what's the test coverage for auth/" |
| Test code review | `analyze --test-quality --files G` | "grade tests/login.spec.ts", "find anti-patterns in tests/" |
| HITL stamping | review | (auto, after triage emits a verdict) "stamp pending verdicts" |
| Plan building | plan | "plan a fix from failures.json", "what order should we tackle this in" |
| Patch test code | `fix --scope test` | "fix tests/foo.spec.ts", "patch the failing selector" |
| Patch product code | `fix --scope product` | "fix src/api.ts", "the product bug needs a code change" |
| Patch (stamp decides) | `fix --scope auto` | (used by orchestrator; resolves scope from review.stamp) |
| Test validation | `validate --test FILE` | "rerun test X twice", "verify fix" |
| Accessibility verification | `validate --a11y --bug N` | "check axe before and after this fix", "a11y delta for bug AB#12345" |
| PR creation | publish | (auto, after validate is two-green) "open the PR for this branch" |
| Auth flows | auth | "write a test that needs logged-in state", "create storage state for the admin role", "refresh expired auth state" |
| Test authoring | author | "write a test for X", "author a spec for scenario Y", "I need coverage for the checkout flow" |
| Traceability | `record --kind matrix` | "import bugs into the matrix", "link bug AB#54321 to tests/foo.spec.ts", "query the matrix for bug X" |
| Pattern learning | `record --kind patterns` | "extract patterns from this week's green fixes", "update FixPatterns" |
| Reporting | report | "weekly digest", "compose the retro", "render flake-rank table" |

## Reviewer gates

| Artifact | Reviewer | Gate |
|---|---|---|
| Triage verdict | review | Must stamp `[p]` / `[t]` / `[s]` / `[o]` before `fix` runs |
| Product-side patch | review | A `[p]` stamp is mandatory for `fix --scope product` to write to `src/` |
| Patch from fix | validate | Two green runs before PR is opened |
| PR open by publish | (humans) | Never auto-merge — even after two-green |
| Test from author | review | Must approve before promotion (7-day probation window) |
| Pattern from record (`--kind patterns`) | (confidence) | Confidence ≥ 0.7 to write to FixPatterns; lower-confidence patterns log a warning |

## Chain — the dev-inner-loop fix flow

The canonical chain that `fix --orchestrate` runs:

```
discover (--source ado|github|local|kusto)
  → triage (per failure, parallel fan-out)
    → review (HITL serial gate — skip with --auto-stamp)
      → plan
        → fix --scope <test|product>     (parallel fan-out, one per plan entry)
          → validate --test              (twice)
            → publish                    (one PR per group)
              → record --kind matrix     (link bug ↔ test ↔ verdict ↔ stamp)
```

`validate --a11y` runs **alongside** `validate --test` when the bug is accessibility-related.
`record --kind patterns` runs **after** the PR merges (extracts patterns from the verified fix).
`record --kind matrix` is **invoked at every stage** to record links / decisions / stamps.
`report` runs **on a schedule** and reads the matrix + audit log.

## Argument shorthand cheat-sheet

| Long form | Replaces (legacy name) |
|---|---|
| `discover --watch` | monitor |
| `discover --source ado --pipeline N` | runner ado |
| `analyze --scenarios` | scenario |
| `analyze --flakes --pipeline N` | kusto-fix |
| `analyze --test-quality --files G` | test-reviewer |
| `fix --scope test` | test-fix |
| `fix --scope product` | product-fix |
| `fix --orchestrate --ado-pipeline N` | ado-fix pipeline |
| `fix --from-triage N` | heal --from-triage |
| `validate --test FILE` | validate FILE |
| `validate --a11y --bug N` | a11y-verifier verify |
| `record --kind matrix --op import` | matrix import |
| `record --kind patterns --from R.json` | learner extract |
| `publish` | pr-creator create |
| `author --scenario "..."` | generate |
