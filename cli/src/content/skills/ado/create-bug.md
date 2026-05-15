---
name: create-bug
description: Create an accessibility bug in ADO for a configured repo. Reads repo config (area path, iteration, tags, MCP server) from ~/.pwagent/config.json. Optionally links to an S360 action item UUID. Uses az CLI when available, falls back to mcp__dynamicscrm-repo__* or mcp__msazure-repo__* based on the target repo.
argument-hint: "<repo-name> \"<title>\" [s360-uuid]"
---

Creates an accessibility bug in the specified configured repo.

## Usage

```
pwagent run ado/create-bug CRM.Client.UnifiedClient "Missing aria-label on Save button"
pwagent run ado/create-bug power-platform-ux "Color contrast failure on TextField label" 8db5ec3e-1c2c-45ca-a402-d42f7b237924
```

Arguments (space-separated):
- `$0` — Repo name matching an entry in `~/.pwagent/config.json`
- `$1` — Bug title (quoted string)
- `$2` — (optional) S360 action item UUID to link

---

## Step 1: Load Repo Config

```
Read(file_path: "~/.pwagent/config.json")
```

Find the repo entry where `repos[*].name === $0`.

If not found:
```
❌ Repo '$0' is not configured in ~/.pwagent/config.json.

Configured repos: <list repos[*].name>

Add this repo to config.json before creating bugs in it.
```

Stop here.

Extract from the matched entry:
- `ADO_AREA_PATH` — `ado.areaPath`
- `ADO_ITERATION` — `ado.iteration`
- `BUG_TAGS` — `ado.bugTags` (array; join with `; ` for ADO)
- `DEFAULT_ASSIGNEE` — `ado.defaultAssignee`
- `ADO_ORG` — `ado.org` (or global `ado.org`)
- `ADO_PROJECT` — `ado.project` (or global `ado.project`)
- `MCP_SERVER` — `ado.mcpServer`

Also read global `ado.defaults` for fallback priority/severity.

---

## Step 2: Transport Detection

```bash
az boards --version >/dev/null 2>&1 && echo "CLI" || echo "MCP"
```

---

## Step 3: Build Description

Compose the bug description from available session context (`VIOLATION_RULE`, `AFFECTED_URL`, `AFFECTED_SELECTOR` if set by a prior `get-bug` or s360 skill call):

```markdown
## Accessibility Violation

**Violation:** <VIOLATION_RULE or "See title">
**Affected URL:** <AFFECTED_URL or "TBD">
**Affected Element:** <AFFECTED_SELECTOR or "TBD">

## Repro Steps
1. Navigate to <AFFECTED_URL>
2. Inspect <AFFECTED_SELECTOR>
3. Observe: <describe violation>

## Expected Behavior
Element meets WCAG 2.1 AA requirements.

## Actual Behavior
<violation description>

<if S360_UUID provided>
## S360 Reference
Action Item: $2
</if>

---
_Created by [PWAgent](https://microsoft.ghe.com/bic/PWAGENT)_
```

---

## Step 4: Set Priority

Default from `ado.defaults.bugSeverity` (`2 - High`).
Override if S360 `SLAState` is known:
- `OutOfSla` → `1 - Critical`
- `InSla` → `3 - Medium`

---

## Step 5: Build Tags

Start with `BUG_TAGS` from Step 1.
Append `s360` if `$2` is provided.
Append violation rule if known (e.g. `color-contrast`).

Join with `; ` (ADO tag separator).

---

## Step 6: Create Work Item

**Via CLI:**
```bash
az boards work-item create \
  --type "Bug" \
  --title "[pwagent][A11y] $1" \
  --project "$ADO_PROJECT" \
  --org $ADO_ORG \
  --area "$ADO_AREA_PATH" \
  --iteration "$ADO_ITERATION" \
  --fields "System.Description=<composed description>" \
            "Microsoft.VSTS.Common.Priority=<priority>" \
            "Microsoft.VSTS.Common.Severity=2 - High" \
            "System.Tags=<tags>" \
            "System.AssignedTo=$DEFAULT_ASSIGNEE"
```

**Via MCP:**
```
mcp__<MCP_SERVER>__wit_create_work_item(
  project: "$ADO_PROJECT",
  type: "Bug",
  title: "[pwagent][A11y] $1",
  description: "<composed description>",
  areaPath: "$ADO_AREA_PATH",
  iterationPath: "$ADO_ITERATION",
  priority: <priority>,
  severity: "2 - High",
  tags: "<tags>",
  assignedTo: "$DEFAULT_ASSIGNEE"
)
```

---

## Step 7: Output

```markdown
✅ ADO Bug created: [#<id>]($ADO_ORG/$ADO_PROJECT/_workitems/edit/<id>)

| Field | Value |
|-------|-------|
| Title | [pwagent][A11y] $1 |
| Repo | $0 |
| Area Path | $ADO_AREA_PATH |
| Priority | <priority> |
| Tags | <tags> |
| S360 Item | $2 or N/A |
```

Store `ADO_BUG_ID = <id>` in session context.
