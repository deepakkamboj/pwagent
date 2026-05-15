---
name: a11y-verify-fix
description: Re-run axe-core scan after a code fix to confirm the target violation is resolved and no new violations were introduced. Posts before/after comparison as an ADO bug comment.
---

Post-fix verification. Confirms the target violation is gone and no regressions were introduced. Updates the ADO bug with the before/after comparison.

## Usage

```
/a11y-verify-fix <url> <violation-rule> <ado-bug-id>
```

Arguments (space-separated):
- `$0` — URL to scan (same as used during reproduction)
- `$1` — axe rule ID that was fixed
- `$2` — ADO bug ID to update with verification results

---

## Step 0: Ask Which ADO Org

**Do NOT auto-detect or assume the ADO org.** pwagent operates across multiple ADO organizations. Always ask first:

> "Which ADO org does bug #$2 belong to? Please provide the full org URL (e.g., https://dynamicscrm.visualstudio.com or https://msazure.visualstudio.com)"

Store the answer as `ADO_BASE_URL`. Derive the appropriate MCP server prefix from the URL.

---

## Step 1: Run Post-Fix Scan (target rule)

Run axe-cli targeting the specific rule that was fixed:

```bash
npx axe $0 --reporter json 2>/dev/null
```

Parse the JSON output and check whether `$1` appears in the violations list.

---

## Step 2: Run Full WCAG Scan for Regressions

```bash
# WCAG 2.1 AA (default)
npx axe $0 --tags wcag2a,wcag2aa 2>/dev/null

# WCAG 2.2 AA (if project targets 2.2)
npx axe $0 --tags wcag2a,wcag2aa,wcag21aa,wcag22aa 2>/dev/null
```

Compare the full violation list against `BASELINE_VIOLATIONS` (from session context — captured before the fix). Flag any rule IDs that are **new** (not present in the baseline) as **regressions**.

---

## Step 3: Determine Outcome

**SUCCESS** — violation resolved, no regressions:
- `VERIFICATION_STATUS = "✅ Passed"`
- Target rule `$1` no longer in results
- No new violations vs baseline

**REGRESSION** — violation resolved but new issues introduced:
- `VERIFICATION_STATUS = "⚠️ Passed with regressions"`
- List new violations

**FAILURE** — violation still present:
- `VERIFICATION_STATUS = "❌ Failed"`

---

## Step 4: Post ADO Comment

Use the MCP server for the confirmed ADO org to post a comment on bug `$2`:

```
wit_create_work_item_comment(
  id: "$2",
  comment: "## Verification Result: <VERIFICATION_STATUS>\n\n**URL:** $0\n**Rule checked:** $1\n\n### Before Fix\n<BASELINE_VIOLATIONS summary>\n\n### After Fix\n<post-fix violations summary>\n\n<regression list if any>"
)
```

If `VERIFICATION_STATUS = "✅ Passed"`, also update bug state to Resolved:

```
wit_update_work_item(
  id: "$2",
  fields: {
    "System.State": "Resolved",
    "Microsoft.VSTS.Common.ResolvedReason": "Fixed"
  }
)
```

---

## Step 5: Output

```markdown
## Verification Complete

| Field | Value |
|-------|-------|
| URL | $0 |
| Rule | $1 |
| Result | <VERIFICATION_STATUS> |
| ADO bug updated | #$2 |
| New violations | <N or "None"> |
```

## Integration

- If regressions found → fix with `skills/a11y/fix.md`
- To generate a full report → `skills/a11y/report-gen.md`
