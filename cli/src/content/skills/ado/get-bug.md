---
name: get-bug
description: Read a specific ADO work item by ID. Returns full details including title, description, repro steps, comments, priority, area path, and tags. Matches the bug's area path to a configured repo from config.json. Uses az CLI when available, falls back to mcp__dynamicscrm-repo__* or mcp__msazure-repo__* based on the target repo.
argument-hint: "<bug-id>"
---

Reads a specific ADO work item and returns full details.

## Usage

```
pwagent run ado/get-bug 12345
```

---

## Step 1: Determine ADO Transport and Context

**Check CLI availability:**
```bash
az boards --version >/dev/null 2>&1 && echo "CLI" || echo "MCP"
```

**Detect from git remote (if in a repo):**
```bash
git remote get-url origin 2>/dev/null
```

Load `~/.pwagent/config.json` and match the remote URL against `repos[*].remoteUrl`.

- If matched: use that entry's `ado.org`, `ado.project`, `ado.mcpServer`.
- If not matched or not in a git repo: ask the user:

  > "Which ADO org does bug #<id> belong to — `dynamicscrm.visualstudio.com` (OneCRM) or `msazure.visualstudio.com` (OneAgile), or another org?"

Store as `ADO_BASE_URL`, `ADO_PROJECT`, `MCP_SERVER`.

---

## Step 2: Fetch Work Item

**Via CLI:**
```bash
az boards work-item show --id $ARGUMENTS --org $ADO_BASE_URL --output json
```

**Via MCP:**
```
mcp__<MCP_SERVER>__wit_get_work_item(id: "$ARGUMENTS")
```

---

## Step 3: Fetch Comments

**Via CLI:**
```bash
az rest --method GET \
  --url "$ADO_BASE_URL/$ADO_PROJECT/_apis/wit/workItems/$ARGUMENTS/comments?api-version=7.1-preview.3"
```

**Via MCP:**
```
mcp__<MCP_SERVER>__wit_list_work_item_comments(id: "$ARGUMENTS")
```

---

## Step 4: Identify Repo from Area Path

Match the bug's `System.AreaPath` to a configured repo entry in `~/.pwagent/config.json`:

- Check `repos[*].ado.areaPath` — if the bug's area path starts with the configured path, that's the repo.
- If no match found, ask the user which repo this bug belongs to and what the local clone path is.

Do **not** assume or hardcode a repo — always derive from config or ask.

---

## Step 5: Extract Key Fields

From the work item, extract:
- `BUG_TITLE` — `System.Title`
- `BUG_STATE` — `System.State`
- `AREA_PATH` — `System.AreaPath`
- `PRIORITY` — `Microsoft.VSTS.Common.Priority`
- `TAGS` — `System.Tags`
- `DESCRIPTION` — `System.Description`
- `REPRO_STEPS` — `Microsoft.VSTS.TCM.ReproSteps`
- `AFFECTED_URL` — parse from description or repro steps
- `AFFECTED_SELECTOR` — parse from description or repro steps
- `VIOLATION_RULE` — axe rule ID from tags or description (e.g. `color-contrast`)
- `REPO_NAME` — matched from Step 4
- `REPO_URL` — `remoteUrl` from matched config entry
- `S360_ACTION_ITEM_ID` — if present in tags or description

---

## Step 6: Output

```markdown
## ADO Bug #$ARGUMENTS

| Field | Value |
|-------|-------|
| Title | <BUG_TITLE> |
| State | <BUG_STATE> |
| Priority | <PRIORITY> |
| Area Path | <AREA_PATH> |
| Repo | [<REPO_NAME>](<REPO_URL>) |
| Violation | <VIOLATION_RULE or "Not specified"> |
| Affected URL | <AFFECTED_URL or "Not specified"> |
| Selector | <AFFECTED_SELECTOR or "Not specified"> |
| S360 Item | <S360_ACTION_ITEM_ID or "N/A"> |
| Tags | <TAGS> |

### Description
<DESCRIPTION>

### Repro Steps
<REPRO_STEPS>

### Comments (<N> total)
<latest 3 comments>
```

Store in session context:
- `BUG_TITLE`, `VIOLATION_RULE`, `AFFECTED_URL`, `AFFECTED_SELECTOR`
- `REPO_NAME`, `REPO_URL`, `S360_ACTION_ITEM_ID`
