---
name: fix-bug
description: Full single-bug ADO fix loop driven from an ADO bug ID. Validates eligibility, checks for existing PRs, locates affected files, applies the fix, verifies with axe-core, commits, opens a PR, and produces a confidence-scored summary. Uses az CLI when available, falls back to mcp__dynamicscrm-repo__* or mcp__msazure-repo__* based on repo config. Leaves bugs in Active state — resolution is user-controlled via resolve-bug.
argument-hint: "<bug-id>"
---

End-to-end fix for a single ADO accessibility bug. Replaces the manual chain of `get-bug → fix → a11y/verify-fix → create-pr`.

## Rules

- **Branch naming:** `a11y/fix-<BUG_ID>` from `main`
- **Fix branch hygiene:** stage and commit **only** the code change — never include `CLAUDE.md` or pwagent config files
- **PR attribution:** every PR description must end with `_Created by [PWAgent](https://microsoft.ghe.com/bic/PWAGENT)_`
- **ADO bug state:** do **not** auto-resolve — leave the bug in **Active** state and post a comment with the PR link; resolution is user-controlled via `resolve-bug`
- **Local repo required:** the target repo must be cloned locally. If the local path is not known, ask: "Where is `<repo-name>` cloned locally?"

## Usage

```
pwagent run ado/fix-bug 12345
```

Argument:
- `$ARGUMENTS` — ADO work item ID (numeric)

---

## Prerequisites

### A. git
```bash
git --version >/dev/null 2>&1 && echo "OK" || echo "MISSING"
```
- **MISSING** → stop. git is required.

### B. az CLI
```bash
az account show >/dev/null 2>&1 && echo "AUTH_OK" || echo "NOT_LOGGED_IN"
```
- **NOT_LOGGED_IN** → ask: "az CLI found but not logged in. Run `az login` or I'll use MCP instead."
- **az not found** → use MCP transport.

### C. Node.js (for axe-core verification)
```bash
node --version >/dev/null 2>&1 && echo "FOUND" || echo "MISSING"
```
- **MISSING** → ask: "Node.js not found. Skip axe verification? (yes/no)"

---

## Step 1: Determine ADO Context and Transport

Load `~/.pwagent/config.json`.

```bash
git remote get-url origin 2>/dev/null
```

Match the remote URL against `repos[*].remoteUrl`.

- If matched: use that entry's `ado.org`, `ado.project`, `ado.areaPath`, `ado.mcpServer`, and the local `path`.
- If not matched: ask the user:

  > "Which ADO org does bug #$ARGUMENTS belong to, and where is the repo cloned locally? Please provide: org URL, project name, and local path."

Store as `ADO_BASE_URL`, `ADO_PROJECT`, `MCP_SERVER`, `LOCAL_REPO_PATH`.

**Transport detection:**
```bash
az boards --version >/dev/null 2>&1 && echo "CLI" || echo "MCP"
```

---

## Step 2: Validate Bug Eligibility

**Via CLI:**
```bash
az boards work-item show --id $ARGUMENTS --org $ADO_BASE_URL --output json
```

**Via MCP:**
```
mcp__<MCP_SERVER>__wit_get_work_item(id: "$ARGUMENTS")
```

Check:
- `System.WorkItemType` must be `Bug`
- `System.State` must be `Active` or `New`
- `System.Tags` must contain `a11y` or `accessibility` or `a11ymas`

If any check fails:
```
❌ Bug #$ARGUMENTS is not eligible for automated fixing.

Reason: <State is Resolved | Missing a11y tag | Not a Bug type>

To fix manually: pwagent run ado/get-bug $ARGUMENTS
```

Stop here.

Extract:
- `BUG_TITLE` — `System.Title`
- `AREA_PATH` — `System.AreaPath`
- `DESCRIPTION` — `System.Description`
- `REPRO_STEPS` — `Microsoft.VSTS.TCM.ReproSteps`
- `TAGS` — `System.Tags`
- `PRIORITY` — `Microsoft.VSTS.Common.Priority`

Match `AREA_PATH` to a repo entry from config.json by checking `repos[*].ado.areaPath`.

If no config match and the area path doesn't point to a known repo, ask:
> "Bug #$ARGUMENTS is in area path `<AREA_PATH>`. Which repo contains this code, and where is it cloned locally?"

---

## Step 3: Check for Existing PRs

**Via MCP:**
```
mcp__<MCP_SERVER>__wit_get_work_item(id: "$ARGUMENTS", expand: "relations")
```

**Via CLI:**
```bash
az boards work-item show --id $ARGUMENTS --org $ADO_BASE_URL --expand relations
```

Look for relations with `rel = "ArtifactLink"` and `url` containing `pullrequest`. If found:

```
⚠️ Bug #$ARGUMENTS already has a linked PR: <PR_URL>

Options:
1. That PR fully fixes the issue → resolve with: pwagent run ado/resolve-bug $ARGUMENTS <PR_URL>
2. That PR is partial → I'll evaluate and add a new commit to it
3. That PR is stale/abandoned → proceed with a new PR
```

Ask the user to choose before continuing.

Also check for an existing branch:
```bash
git branch -r 2>/dev/null | grep -E "a11y/fix-$ARGUMENTS"
```

---

## Step 4: Read Bug and Extract Fix Context

Read MAS reference for platform-specific guidance:
```
Read(file_path: "<pwagent content>/skills/a11y/MAS.md")
```

Read Narrator patterns:
```
Read(file_path: "<pwagent content>/skills/a11y/narrator-patterns.md")
```

From the bug description and repro steps, extract:
- `AFFECTED_URL` — URL where the violation occurs
- `AFFECTED_SELECTOR` — CSS selector or element description
- `VIOLATION_RULE` — axe rule ID (e.g. `color-contrast`, `aria-required-attr`)
- `WCAG_CRITERION` — e.g. `1.4.3 Contrast Minimum`
- `IS_NARRATOR_BUG` — true if description mentions Narrator, screen reader, announces, UIA

---

## Step 5: Locate Affected File(s)

Switch to the local repo directory (from config `repos[*].path` or from the user's answer in Step 1).

Search for the affected component:

```bash
grep -rn "<COMPONENT_NAME\|className.*<SELECTOR>" . --include="*.tsx" --include="*.jsx" 2>/dev/null | head -20
```

Read the matched file(s) to understand context before applying any fix.

---

## Step 6: Apply Accessibility Fix

Apply the fix based on `VIOLATION_RULE`. Follow patterns from `narrator-patterns.md` if `IS_NARRATOR_BUG`.

**Standard fix patterns:**

| Violation Rule | Fix |
|---------------|-----|
| `color-contrast` | Update color token to meet 4.5:1 ratio (use `a11y/review-contrast` for exact hex) |
| `image-alt` | Add descriptive `alt` attribute; `alt=""` for decorative |
| `label` | Add `<label htmlFor>` or `aria-label` |
| `aria-required-attr` | Add missing ARIA attributes (e.g. `aria-expanded` on disclosure) |
| `aria-hidden-focus` | Remove `aria-hidden` from focusable elements |
| `focus-visible` | Add `:focus-visible` CSS rule with visible outline |
| `button-name` | Add `aria-label` or visible text |
| `link-name` | Add descriptive `aria-label` or visible link text |
| `heading-order` | Correct heading level to maintain sequence |

**Narrator-specific fixes (when `IS_NARRATOR_BUG`):**

| Narrator Issue | Fix |
|---------------|-----|
| Field label not announced | Add `<label>` association or `aria-labelledby` |
| Button state not announced | Add `aria-pressed` or `aria-expanded` |
| Validation error not announced | Add `role="alert"` + `aria-invalid` + `aria-describedby` |
| Dynamic content not announced | Add `aria-live="polite"` or `role="status"` |

**Confidence scoring:**

| Confidence | Criteria |
|-----------|----------|
| **High** | Standard pattern, unambiguous, no judgment needed |
| **Medium** | Fix applied but some details inferred; human review recommended |
| **Low** | Placeholder only — requires design/content input |

Store `CONFIDENCE` and `CONFIDENCE_REASON`.

---

## Step 7: Verify Fix with axe-core

If `AFFECTED_URL` is available and a dev server is running:

```bash
npx axe <AFFECTED_URL> --tags wcag2a,wcag2aa 2>/dev/null
```

**Outcomes:**
- ✅ **Passed** — violation gone, no new violations
- ⚠️ **Regression** — violation gone but new issues introduced
- ❌ **Failed** — violation still present (re-examine the fix)
- ⏭️ **Skipped** — no URL available or dev server not running (note in PR)

Store `VERIFICATION_STATUS`.

Post verification comment on bug:

**Via MCP:**
```
mcp__<MCP_SERVER>__wit_create_work_item_comment(
  id: "$ARGUMENTS",
  comment: "## Verification: <VERIFICATION_STATUS>\n\n**Rule checked:** <VIOLATION_RULE>\n**URL:** <AFFECTED_URL or 'N/A'>\n\n<result details>\n\n_[PWAgent](https://microsoft.ghe.com/bic/PWAGENT)_"
)
```

---

## Step 8: Commit, Push, and Open PR

**Create or reuse branch:**
```bash
git checkout -b a11y/fix-$ARGUMENTS 2>/dev/null || git checkout a11y/fix-$ARGUMENTS
git add <changed files>
git commit -m "[pwagent] fix(a11y): <BUG_TITLE>

Fixes ADO Bug #$ARGUMENTS.
Violation: <VIOLATION_RULE> (<WCAG_CRITERION>).
Confidence: <CONFIDENCE>.
<If IS_NARRATOR_BUG: Narrator will now announce: <announcement description>.>"
git push -u origin a11y/fix-$ARGUMENTS
```

**Open PR via CLI:**
```bash
az repos pr create \
  --title "[pwagent][A11y] <BUG_TITLE>" \
  --description "## Accessibility Fix\n\n**Bug:** [#$ARGUMENTS]($ADO_BASE_URL/$ADO_PROJECT/_workitems/edit/$ARGUMENTS)\n**Violation:** <VIOLATION_RULE>\n**WCAG:** <WCAG_CRITERION>\n**Confidence:** <CONFIDENCE> — <CONFIDENCE_REASON>\n\n## What Changed\n<description of code change>\n\n## Verification\n<VERIFICATION_STATUS> — axe-core post-fix scan result\n\n---\n_Created by [PWAgent](https://microsoft.ghe.com/bic/PWAGENT)_" \
  --source-branch a11y/fix-$ARGUMENTS \
  --target-branch main \
  --org $ADO_BASE_URL \
  --project $ADO_PROJECT \
  --repository <REPO_NAME> \
  --work-items $ARGUMENTS
```

**Open PR via MCP:**
```
mcp__<MCP_SERVER>__git_create_pull_request(
  repositoryId: "<REPO_NAME>",
  sourceBranch: "refs/heads/a11y/fix-$ARGUMENTS",
  targetBranch: "refs/heads/main",
  title: "[pwagent][A11y] <BUG_TITLE>",
  description: "Fixes ADO Bug #$ARGUMENTS\nViolation: <VIOLATION_RULE>\n\n_Created by [PWAgent](https://microsoft.ghe.com/bic/PWAGENT)_",
  workItemRefs: [{ id: "$ARGUMENTS" }]
)
```

Capture `PR_URL` and `PR_ID`.

---

## Step 9: Post PR Comment

> **Note:** Do **not** resolve or change the bug state. The bug remains **Active**. Resolution is user-controlled via `resolve-bug`.

**Via MCP:**
```
mcp__<MCP_SERVER>__wit_create_work_item_comment(
  id: "$ARGUMENTS",
  comment: "## Fix PR Created ✅\n\n**PR:** [#<PR_ID>](<PR_URL>)\n**Confidence:** <CONFIDENCE> — <CONFIDENCE_REASON>\n**Verification:** <VERIFICATION_STATUS>\n\nBug remains Active. Resolve with: `pwagent run ado/resolve-bug $ARGUMENTS <PR_URL>`\n\n_[PWAgent](https://microsoft.ghe.com/bic/PWAGENT)_"
)
```

Output fix summary:

```markdown
## Fix PR Created

| Field | Value |
|-------|-------|
| Bug | [#$ARGUMENTS]($ADO_BASE_URL/$ADO_PROJECT/_workitems/edit/$ARGUMENTS) |
| Title | <BUG_TITLE> |
| Violation | <VIOLATION_RULE> (<WCAG_CRITERION>) |
| Fix confidence | <CONFIDENCE> — <CONFIDENCE_REASON> |
| Verification | <VERIFICATION_STATUS> |
| PR | [#<PR_ID>](<PR_URL>) |
| Repo | <REPO_NAME> |
| Branch | a11y/fix-$ARGUMENTS |
| Bug state | Active (resolve with `pwagent run ado/resolve-bug $ARGUMENTS <PR_URL>`) |
```
