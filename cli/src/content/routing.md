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
| **S360 accessibility — scan** | `s360 --scan <alias\|guid>` | "scan S360 a11y items for bos", "what accessibility items does my team own", "list WCAG action items for service X" |
| S360 accessibility — triage | `s360 --triage <alias\|guid>` | "triage S360 a11y backlog for bos", "which items are out of SLA", "prioritize accessibility action items" |
| S360 accessibility — fix | `s360 --fix <uuid>` | "fix S360 action item ABC-123", "close the color-contrast item", "remediate this WCAG violation" |
| S360 ETA update | `s360 --update-eta <uuid> --eta YYYY-MM-DD` | "update ETA for action item X", "mark item in-progress with new date" |
| S360 accessibility — report | `s360 --report <alias>` | "S360 a11y report for bos", "accessibility compliance summary", "how many items are out of SLA" |
| S360 raw list | `s360 --list <alias\|guid>` | "list all S360 a11y items for bos", "dump action items to CSV" |
| **Accessibility — scan URL** | `a11y --scan <url>` | "scan this URL for WCAG violations", "run axe on https://...", "check accessibility of this page" |
| Accessibility — scan repo | `a11y --scan-repo --base-url <url>` | "scan all routes in our dev server", "batch axe scan the whole app" |
| Accessibility — review contrast | `a11y --review contrast --path <dir>` | "check color contrast", "find contrast violations in src/", "WCAG 1.4.3" |
| Accessibility — review color | `a11y --review color --path <dir>` | "check color-only indicators", "error only shown in red", "WCAG 1.4.1" |
| Accessibility — review links | `a11y --review links --path <dir>` | "find generic link text", "check link accessibility", "click here read more WCAG 2.4.4" |
| Accessibility — review modes | `a11y --review modes --path <dir>` | "high contrast mode", "forced colors", "reduced motion", "MAS accessibility modes" |
| Accessibility — review viewports | `a11y --review viewports --path <dir>` | "responsive accessibility", "touch targets", "check mobile breakpoints" |
| Accessibility — review interactive | `a11y --review interactive --url <url>` | "tabs accessibility", "modal keyboard trap", "combobox ARIA", "test interactive elements" |
| Accessibility — fix violations | `a11y --fix <file-or-dir>` | "fix accessibility violations", "add aria labels", "fix contrast in src/components" |
| Accessibility — verify fix | `a11y --verify-fix <url> <rule> <bug>` | "verify the a11y fix", "confirm violation is resolved", "post axe result to ADO bug" |
| Accessibility — test generation | `a11y --test-gen --component <file>` | "generate accessibility tests", "write axe-core playwright tests", "a11y test for modal" |
| Accessibility — HTML report | `a11y --report --url <url>` | "generate accessibility report", "WCAG compliance report", "a11y audit report" |
| **ADO a11y — list repos** | `ado-a11y list repos` | "list configured repos", "show open a11y bugs", "what repos are set up" |
| ADO a11y — read bug | `ado-a11y get bug <id>` | "get bug 12345", "read ADO bug", "show details for work item" |
| ADO a11y — create bug | `ado-a11y create bug <repo> "<title>"` | "create accessibility bug in CRM.Client.UnifiedClient", "log a11y issue in ADO" |
| ADO a11y — fix bug | `ado-a11y fix bug <id>` | "fix ADO bug 12345", "automated fix for accessibility work item", "run fix loop on bug" |
| ADO a11y — batch fix | `ado-a11y fix all "<area-path>"` | "fix all accessibility bugs in OneCRM\\Client\\Controls", "batch fix a11y bugs" |
| ADO a11y — create PR | `ado-a11y create pr <id> "<title>" <repo>` | "open PR for bug 12345", "commit and create pull request for accessibility fix" |
| ADO a11y — resolve bug | `ado-a11y resolve bug <id> <pr-url>` | "resolve bug 12345", "mark bug fixed after merge", "close the accessibility work item" |

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
