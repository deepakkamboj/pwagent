---
name: test-review
description: 'Test code quality review for Playwright specs. Deterministic regex catalog in scripts/test_quality_rules.json scanned by hooks/test-quality-scan.ps1; agent only does holistic judgments (assertion semantics, locator-strategy fit, isolation).'
allowed-tools: Read Bash(pwsh:*)
---

# Test code quality — two-layer review

Per N2 ([SPEC.md §16](../../../../SPEC.md)) the deterministic part of test review (regex against the catalog) runs as `hooks/test-quality-scan.ps1`. The agent reads the resulting sidecar + adds holistic findings.

## Layer 1 — deterministic (catalog)

The rule catalog lives at `scripts/test_quality_rules.json`. Each rule:

```json
{
  "id": "PW-001",
  "severity": "High|Medium|Low",
  "pattern": "<regex matched against file content line>",
  "message": "<one-line guidance>",
  "fix_guide": "<relative path under skills/>"
}
```

Current catalog (operationalizes `skills/SKILL.md`'s Forbidden list + Golden Rules):

| ID | Severity | Catches |
|---|---|---|
| PW-001 | High | `page.locator('css=...')` |
| PW-002 | High | `page.locator('xpath=...')` or `page.locator('//...')` |
| PW-003 | High | `page.locator('.class')` or `page.locator('#id')` |
| PW-004 | High | `page.$(...)` or `page.$$(...)` (handle APIs) |
| PW-005 | High | `page.waitForSelector(...)` |
| PW-006 | High | `page.waitForTimeout(...)` |
| PW-007 | Medium | `expect(await locator.textContent())` (non-web-first) |
| PW-008 | Medium | Hardcoded `https?://...` URL |
| PW-009 | Medium | `retries: <non-zero-non-2>` |

Add new rules by editing `scripts/test_quality_rules.json` and re-running the scan. No code changes needed.

## Layer 2 — holistic (LLM)

The agent reads `runs/<runId>/.test-quality-findings.json` (written by the hook) and asks, per test file:

1. Are assertions testing **behavior** or **implementation**?
2. Could a `getByRole` replace a `getByTestId`?
3. Is state **isolated**, or does test N depend on test N-1?
4. Are mocks scoped to the right route, or are they polluting other tests?
5. Are setup/teardown via fixtures or `beforeEach` blocks polluting state?

Output ≥3 semantic findings per file (or zero with "no semantic issues" if clean).

## Severity rubric

| Severity | Action |
|---|---|
| `High` | Always file an ADO bug; block the agent's PR if introduced new (`/pwagent-fix` integration) |
| `Medium` | PR comment via `az repos pr comment create` if `--pr-comment <id>` flag |
| `Low` | Informational; appears in dashboard only |

## Output

`~/.copilot/state/runs/<runId>/test-review.md`:
- Top: severity counts.
- Per file: findings table (rule_id | severity | line | message | fix_guide).
- Footer: actionable summary.

Every finding cites the literal matched line (from the hook's `matched` field).
