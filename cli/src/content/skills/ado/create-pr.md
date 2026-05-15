---
name: create-pr
description: Commit local accessibility fix changes and open a PR in the configured ADO repo. Reads repo config from ~/.pwagent/config.json. Links PR to the ADO bug. Uses az CLI when available, falls back to mcp__dynamicscrm-repo__* or mcp__msazure-repo__* based on the target repo.
argument-hint: "<bug-id> \"<bug-title>\" <repo-name>"
---

Commits the local code changes and opens a PR in the configured ADO repo.

## Rules

- **Branch naming:** `a11y/fix-<BUG_ID>` from `main`
- **Fix branch hygiene:** stage and commit **only** the code change — never include `CLAUDE.md` or pwagent config files
- **PR attribution:** every PR description must end with `_Created by [PWAgent](https://microsoft.ghe.com/bic/PWAGENT)_`
- **ADO bug state:** do **not** auto-resolve or mark bugs as Resolved — leave the bug in **Active** state; resolution is user-controlled via `resolve-bug`

## Usage

```
pwagent run ado/create-pr 12345 "Missing aria-label on Save button" CRM.Client.UnifiedClient
pwagent run ado/create-pr 12345 "Color contrast failure on TextField" power-platform-ux
```

Arguments (space-separated):
- `$0` — ADO bug ID
- `$1` — Bug title (used in branch name, commit message, and PR title)
- `$2` — Repo name (must match an entry in `~/.pwagent/config.json`)

---

## Step 1: Prerequisites

**git:**
```bash
git --version >/dev/null 2>&1 && echo "OK" || echo "MISSING"
```
- **MISSING** → stop. `git` is required.

**az CLI auth check:**
```bash
az account show >/dev/null 2>&1 && echo "AUTH_OK" || echo "NOT_LOGGED_IN"
```
- **NOT_LOGGED_IN** → prompt: "Run `az login` then re-run, or I'll use MCP instead."

---

## Step 2: Resolve Repo Config

```
Read(file_path: "~/.pwagent/config.json")
```

Find the repo entry where `repos[*].name === $2`.

If not found:
```
❌ Repo '$2' is not configured in ~/.pwagent/config.json.

Add this repo to config.json before creating PRs in it.
```

Stop here.

Extract: `ADO_ORG`, `ADO_PROJECT`, `ADO_AREA_PATH`, `MCP_SERVER`.

**Transport detection:**
```bash
az boards --version >/dev/null 2>&1 && echo "CLI" || echo "MCP"
```

---

## Step 3: Check for Existing PRs

Before doing any work, check whether a PR already exists for this bug.

**Via CLI:**
```bash
az boards work-item show --id $0 --org $ADO_ORG --expand relations --output json
```

**Via MCP:**
```
mcp__<MCP_SERVER>__wit_get_work_item(id: "$0", expand: "relations")
```

Look for relations where `rel = "ArtifactLink"` and the URL contains `pullrequest`. If found:

```
⚠️ Bug #$0 already has a linked PR: <PR_URL>

Is this PR still open and relevant?
- Yes, fully fixed → resolve with pwagent run ado/resolve-bug $0 <PR_URL>
- Yes, but partial → I'll add a new commit to the existing branch
- No, it is stale → continue to create a new PR
```

Ask the user before proceeding.

Also check for an existing branch:
```bash
git branch -r 2>/dev/null | grep -E "a11y/fix-$0"
```

If the branch already exists, check it out instead of creating a new one in Step 4.

---

## Step 4: Create Branch

```bash
git checkout -b a11y/fix-$0
```

If branch already exists:
```bash
git checkout a11y/fix-$0
```

---

## Step 5: Stage and Commit

Stage only files changed during the fix. **Never include `CLAUDE.md`, `.pwagent/`, or any config files:**

```bash
git add <changed files>
```

```bash
git commit -m "[pwagent] fix(a11y): $1

Fixes ADO Bug #$0.
Violation resolved. Verified by axe-core post-fix.
Repo: $2"
```

---

## Step 6: Push Branch

```bash
git push -u origin a11y/fix-$0
```

---

## Step 7: Create Pull Request

**Via CLI:**
```bash
az repos pr create \
  --title "[pwagent][A11y] $1" \
  --description "## Accessibility Fix\n\nFixes ADO Bug [#$0]($ADO_ORG/$ADO_PROJECT/_workitems/edit/$0).\n\n**Violation fixed:** <VIOLATION_RULE>\n**Affected URL:** <AFFECTED_URL>\n**Repo:** $2\n\n---\n_Created by [PWAgent](https://microsoft.ghe.com/bic/PWAGENT)_" \
  --source-branch a11y/fix-$0 \
  --target-branch main \
  --org $ADO_ORG \
  --project $ADO_PROJECT \
  --repository $2 \
  --work-items $0
```

**Via MCP:**
```
mcp__<MCP_SERVER>__git_create_pull_request(
  repositoryId: "$2",
  sourceBranch: "refs/heads/a11y/fix-$0",
  targetBranch: "refs/heads/main",
  title: "[pwagent][A11y] $1",
  description: "Fixes ADO Bug #$0\nViolation: <VIOLATION_RULE>\n\n_Created by [PWAgent](https://microsoft.ghe.com/bic/PWAGENT)_",
  workItemRefs: [{ id: "$0" }]
)
```

Capture `PR_URL` and `PR_ID`.

---

## Step 8: Post Comment on Bug

**Via CLI:**
```bash
az rest --method POST \
  --url "$ADO_ORG/$ADO_PROJECT/_apis/wit/workItems/$0/comments?api-version=7.1-preview.3" \
  --headers "Content-Type=application/json" \
  --body "{\"text\":\"PR created: [#<PR_ID>](<PR_URL>)\n\nBranch: \`a11y/fix-$0\`\n\n_[PWAgent](https://microsoft.ghe.com/bic/PWAGENT)_\"}"
```

**Via MCP:**
```
mcp__<MCP_SERVER>__wit_create_work_item_comment(
  id: "$0",
  comment: "PR created: [#<PR_ID>](<PR_URL>)\n\nBranch: `a11y/fix-$0`\n\n_[PWAgent](https://microsoft.ghe.com/bic/PWAGENT)_"
)
```

---

## Step 9: Output

```markdown
## PR Created

| Field | Value |
|-------|-------|
| PR | [#<PR_ID>](<PR_URL>) |
| Title | [pwagent][A11y] $1 |
| Branch | a11y/fix-$0 |
| Target | main |
| Repo | $2 |
| Bug linked | [#$0]($ADO_ORG/$ADO_PROJECT/_workitems/edit/$0) |
| Bug state | Active (resolve with `pwagent run ado/resolve-bug $0 <PR_URL>`) |
```

Store `PR_URL` and `PR_ID` in session context.
