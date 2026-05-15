---
name: fix-all
description: Batch fix all eligible accessibility bugs under an ADO area path. Loads area path → repo mapping from ~/.pwagent/config.json, queries ADO via WIQL for Active/New bugs tagged a11y/accessibility, confirms with user, then runs fix-bug sequentially for each one. Produces a consolidated confidence report with per-bug status, PR links, and summary table.
argument-hint: "<area-path>"
---

Batch accessibility bug fixer. Queries all eligible bugs under an ADO area path and fixes them one by one.

## Rules

- Each bug is fixed via `fix-bug` — all rules from that skill apply (branch naming, hygiene, PR attribution)
- **ADO bugs remain Active** after each fix; PRs are created and linked but resolution is user-controlled via `resolve-bug`
- Confirmation required before starting — never process bugs silently

## Usage

```
pwagent run ado/fix-all "OneCRM\Client\UnifiedClient"
pwagent run ado/fix-all "OneCRM\Client\Controls"
pwagent run ado/fix-all "OneAgile\Power Platform UX"
```

Argument:
- `$ARGUMENTS` — ADO area path (quoted if it contains backslashes)

---

## Step 1: Prerequisites

```bash
git --version >/dev/null 2>&1 && echo "OK" || echo "MISSING"
```
- **MISSING** → stop.

```bash
az account show >/dev/null 2>&1 && echo "AUTH_OK" || echo "NOT_LOGGED_IN"
```
- **NOT_LOGGED_IN** → prompt to run `az login` or use MCP.

---

## Step 2: Detect Org from Area Path and Config

Load `~/.pwagent/config.json`.

Match `$ARGUMENTS` against `repos[*].ado.areaPath` (exact or prefix match).

- If matched: use that entry's `ado.org`, `ado.project`, `ado.mcpServer`, and local `path`.
- If not matched: ask the user:

  > "Area path `$ARGUMENTS` is not configured in `~/.pwagent/config.json`. Which ADO org and project does it belong to?"

**Transport detection:**
```bash
az boards --version >/dev/null 2>&1 && echo "CLI" || echo "MCP"
```

Store as `ADO_BASE_URL`, `ADO_PROJECT`, `MCP_SERVER`.

---

## Step 3: Query Eligible Bugs

**Via CLI:**
```bash
az boards query \
  --wiql "SELECT [System.Id], [System.Title], [System.State], [System.Tags], [Microsoft.VSTS.Common.Priority], [System.AssignedTo] FROM WorkItems WHERE [System.TeamProject] = '$ADO_PROJECT' AND [System.WorkItemType] = 'Bug' AND [System.AreaPath] UNDER '$ARGUMENTS' AND [System.State] IN ('Active', 'New') AND ([System.Tags] CONTAINS 'a11y' OR [System.Tags] CONTAINS 'accessibility' OR [System.Tags] CONTAINS 'a11ymas')" \
  --org $ADO_BASE_URL \
  --project $ADO_PROJECT
```

**Via MCP:**
```
mcp__<MCP_SERVER>__wit_query_by_wiql(
  query: "SELECT [System.Id], [System.Title], [System.State], [System.Tags], [Microsoft.VSTS.Common.Priority], [System.AssignedTo] FROM WorkItems WHERE [System.TeamProject] = '$ADO_PROJECT' AND [System.WorkItemType] = 'Bug' AND [System.AreaPath] UNDER '$ARGUMENTS' AND [System.State] IN ('Active', 'New') AND ([System.Tags] CONTAINS 'a11y' OR [System.Tags] CONTAINS 'accessibility' OR [System.Tags] CONTAINS 'a11ymas')"
)
```

Display the full bug list before processing:

```markdown
## Bugs Found Under <$ARGUMENTS>

| # | ID | Title | Priority | State | Tags |
|---|-----|-------|----------|-------|------|
| 1 | #12345 | Missing aria-label on Save button | 1 | Active | accessibility; a11y |
...

Total: <N> bugs. Proceed to fix all? (yes to continue)
```

Wait for user confirmation before starting fixes.

If 0 bugs found:
```
✅ No eligible accessibility bugs found under <$ARGUMENTS>.

Criteria: WorkItemType=Bug, State IN (Active, New), Tags CONTAINS a11y/accessibility/a11ymas
```

Stop here.

---

## Step 4: Fix Each Bug Sequentially

For each bug in the list, run `fix-bug`:

```
Skill(skill: "ado:fix-bug", args: "<bug-id>")
```

After each fix, capture and store in `FIX_RESULTS`:
- `ID`, `Title`, `WCAG`, `Confidence`, `Verification`, `PR`, `Status`

**On failure:** log the error, mark as `Failed`, continue to the next bug. Do not abort the entire batch.

---

## Step 5: Print Consolidated Report

```markdown
## Batch Fix Report — <$ARGUMENTS>

**Total bugs:** <N>  |  ✅ PR Created: N  |  ⚠️ Partial: N  |  ❌ Failed: N  |  ⏭️ Skipped: N

> All bugs remain **Active** after this run. Use `pwagent run ado/resolve-bug <id> <pr-url>` per bug once the PR is reviewed and merged.

### Results

| # | ID | Title | WCAG | Confidence | Verification | PR | Status |
|---|-----|-------|------|-----------|-------------|-----|--------|
| 1 | [#12345]($ADO_BASE_URL/$ADO_PROJECT/_workitems/edit/12345) | Missing aria-label | 4.1.2 | High | ✅ | [#101](<url>) | PR Open |
...

### Failed Bugs

| ID | Title | Reason |
|----|-------|--------|
| #12348 | Complex tab component | Fix confidence: Low — requires design input |

### Confidence Summary

| Confidence | Count | Action |
|-----------|-------|--------|
| High | N | PRs ready to merge |
| Medium | N | Review PRs before merging |
| Low | N | Manual intervention needed |

### Next Steps
- Review Medium/Low confidence PRs before merging
- For failed bugs: use `pwagent run ado/fix-bug <id>` individually for more context
- Run `pwagent run a11y/scan <url>` on affected pages to confirm all violations cleared
```
