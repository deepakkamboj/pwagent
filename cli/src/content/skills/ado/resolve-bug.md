---
name: resolve-bug
description: User-invoked only — resolve an ADO accessibility bug after a fix is verified. Sets state to Resolved, posts a comment with the PR link, and optionally updates the S360 action item ETA. Never called automatically by the fix loop. Uses az CLI when available, falls back to mcp__dynamicscrm-repo__* or mcp__msazure-repo__* based on the target repo.
argument-hint: "<bug-id> <pr-url> [s360-uuid]"
---

Resolves an ADO accessibility bug once a fix has been verified and a PR created.

> **This skill is user-controlled only.** It is never called automatically by `fix-bug` or `create-pr`. The fix loop leaves bugs in **Active** state and posts a PR link comment. Run this skill manually once the PR is reviewed and merged.

## Usage

```
pwagent run ado/resolve-bug 12345 https://dynamicscrm.visualstudio.com/OneCRM/_git/CRM.Client.UnifiedClient/pullrequest/999
pwagent run ado/resolve-bug 12345 https://msazure.visualstudio.com/OneAgile/_git/power-platform-ux/pullrequest/999 8db5ec3e-1c2c-45ca-a402-d42f7b237924
```

Arguments (space-separated):
- `$0` — ADO bug ID
- `$1` — PR URL
- `$2` — (optional) S360 action item UUID — if provided, also updates S360 ETA

---

## Step 1: Determine ADO Context

Detect from git remote first:
```bash
git remote get-url origin 2>/dev/null
```

Load `~/.pwagent/config.json` and match against `repos[*].remoteUrl`.

- If matched: use that entry's `ado.org`, `ado.project`, `ado.mcpServer`.
- If not matched: derive org from the PR URL (`$1`) by checking the hostname.
  - `dynamicscrm.visualstudio.com` → `ADO_ORG=https://dynamicscrm.visualstudio.com`, `ADO_PROJECT=OneCRM`, `MCP_SERVER=dynamicscrm-repo`
  - `msazure.visualstudio.com` → `ADO_ORG=https://msazure.visualstudio.com`, `ADO_PROJECT=OneAgile`, `MCP_SERVER=msazure-repo`
  - Unknown hostname → ask the user:

    > "Which ADO org does bug #$0 belong to? Please confirm the org URL."

**Transport detection:**
```bash
az boards --version >/dev/null 2>&1 && echo "CLI" || echo "MCP"
```

---

## Step 2: Post Resolution Comment

**Via CLI:**
```bash
az rest --method POST \
  --url "$ADO_ORG/$ADO_PROJECT/_apis/wit/workItems/$0/comments?api-version=7.1-preview.3" \
  --headers "Content-Type=application/json" \
  --body "{\"text\":\"## Fix Verified ✅\n\n**PR:** [$1]($1)\n\nAxe-core scan confirmed the violation is resolved. No regressions introduced.\n\n_Resolved by [PWAgent](https://microsoft.ghe.com/bic/PWAGENT)_\"}"
```

**Via MCP:**
```
mcp__<MCP_SERVER>__wit_create_work_item_comment(
  id: "$0",
  comment: "## Fix Verified ✅\n\n**PR:** [$1]($1)\n\nAxe-core scan confirmed the violation is resolved. No regressions introduced.\n\n_Resolved by [PWAgent](https://microsoft.ghe.com/bic/PWAGENT)_"
)
```

---

## Step 3: Resolve the Work Item

**Via CLI:**
```bash
az boards work-item update --id $0 \
  --org $ADO_ORG \
  --state "Resolved" \
  --fields "Microsoft.VSTS.Common.ResolvedReason=Fixed"
```

**Via MCP:**
```
mcp__<MCP_SERVER>__wit_update_work_item(
  id: "$0",
  fields: { "System.State": "Resolved", "Microsoft.VSTS.Common.ResolvedReason": "Fixed" }
)
```

---

## Step 4: Update S360 ETA (if `$2` provided)

If an S360 UUID was passed, update the action item ETA to today via the S360 MCP server:

```
mcp__s360__set_s360_action_item_eta_and_status(
  kpiId: "$2",
  kpiActionItemIds: ["$2"],
  eta: "<today YYYY-MM-DD UTC>",
  etaStatus: "Fixed — PR: $1"
)
```

---

## Step 5: Output

```markdown
✅ Bug #$0 resolved

| Field | Value |
|-------|-------|
| Bug | [#$0]($ADO_ORG/$ADO_PROJECT/_workitems/edit/$0) |
| State | Resolved |
| PR | [$1]($1) |
| S360 updated | ✅ ETA set to <today> / N/A |
```
