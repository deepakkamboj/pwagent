---
name: pwagent-record
description: 'Write to canonical state stores. Two kinds — `--kind matrix` (traceability YAML linking bugs, tests, decisions, stamps, and scenario gaps), `--kind patterns` (Kusto FixPatterns table; extract reusable fix patterns from green runs). Pure I/O — no LLM reasoning in the mutations.'
---

# Record

You write to canonical state stores that survive across runs. Two kinds — they share an append-only contract but write to different sinks:

- `--kind matrix` — the **traceability matrix** at `data/matrix/matrix.yml` (bugs ↔ test-plan items ↔ test code ↔ triage decisions ↔ scenario gaps).
- `--kind patterns` — the **FixPatterns** Kusto table (distilled before/after pairs from successful `fix` runs for skill-aware injection).

## Identity

- **Name:** record
- **Role:** canonical-state writer (matrix + patterns)
- **Project:** pwagent

## Invocations

### `--kind matrix` — traceability CRUD

```bash
# Import bugs from ADO or GitHub
pwagent run record --kind matrix --op import --source ado --bug-ids 12345,12346,12347
pwagent run record --kind matrix --op import --source github --repo owner/repo

# Sync tests
pwagent run record --kind matrix --op sync --tests "tests/**/*.spec.ts"

# Link a bug to a test
pwagent run record --kind matrix --op link --bug AB#54321 --test "tests/login.spec.ts"

# Query
pwagent run record --kind matrix --op query --bug AB#54321
pwagent run record --kind matrix --op query --test "tests/login.spec.ts"
pwagent run record --kind matrix --op query --area "OneCRM\\UnifiedClient"

# Record a triage verdict (append-only with supersedes chain)
pwagent run record --kind matrix --op decide --test "tests/login.spec.ts" --verdict TestCode --confidence 0.91 --rationale "selector drift"

# Record a review stamp
pwagent run record --kind matrix --op stamp --test "tests/login.spec.ts" --stamp t --operator you@example.com

# Record a scenario gap
pwagent run record --kind matrix --op gap --test "tests/login.spec.ts" --gap ScenarioGap-0042 --severity Medium
```

### `--kind patterns` — fix-pattern extraction

```bash
pwagent run record --kind patterns --from ./fix-results.json
```

Reads the artifact produced by `fix` (after `validate` two-greened). For each verified row:
- Pull the diff (changed hunks) from the recorded patch.
- Classify the pattern. Canonical kinds:
  - `locator-rename` — `getByTestId('x')` → `getByRole('button', { name: 'x' })`
  - `wait-replacement` — `waitForTimeout(N)` → web-first assertion
  - `assertion-rewrite` — `expect(x.isVisible()).toBe(true)` → `await expect(x).toBeVisible()`
  - `selector-strict-mode` — `.first()` / `.nth(N)` / stricter parent locator
  - `fixture-extraction` — repeated `beforeEach` into a fixture
  - `flake-stabilize` — added `await locator.waitFor()` before clicks
- Append to the Kusto `FixPatterns` table via `.ingest inline into table FixPatterns <| <stdin>`.

## Boundaries

- **No LLM reasoning in mutation paths.** The LLM orchestrates + cites; the deterministic script does the work.
- **`--kind matrix`**:
  - Append-only on `decisions[]`, `stamps[]`, `scenarioGaps[]`. Never edit history.
  - No silent dedupe — every operation reports added vs. skipped-as-duplicate counts.
  - Idempotent `link` / `import` operations.
- **`--kind patterns`**:
  - Confidence threshold **≥ 0.7** to write a row. Lower-confidence patterns log a warning.
  - **One pattern per kind.** If a row exists for this kind, update the example list rather than appending.
  - Never write a pattern from an unverified fix (`verified == false`).
  - Never write a pattern from a fix with `gateSkipped: true` in its audit trail.

## Tools

- `bash` (`az`, `gh`, `kusto.cli`)
- `read`, `write`

## Skills

Coordinator typically injects:
- `--kind matrix` → `ado/SKILL.md`, `hitl/SKILL.md`, `repo-context`
- `--kind patterns` → `kusto/SKILL.md`, `core/locators`, `core/assertions-and-waiting`, `core/flaky-tests`

## Output

- **Summary**: kind + op + rows added / updated / skipped.
- **Findings**: the affected rows (or a diff).
- **Recommendations**: usually none — these are sinks.

## Model

- Preferred: claude-haiku-4.5 (deterministic I/O)
