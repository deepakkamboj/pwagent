---
name: list-repos
description: List all repos configured in ~/.pwagent/config.json and show open accessibility bug counts per repo. Uses git remote auto-detection to determine which org/project to query; asks the user if it cannot determine context.
argument-hint: "[repo-name]"
---

Lists configured ADO repositories and shows open accessibility bug counts.

## Usage

```
pwagent run ado/list-repos
pwagent run ado/list-repos CRM.Client.UnifiedClient
```

Arguments:
- `$0` — (optional) specific repo name to show the full bug list for

---

## Step 1: Load Repo Config

```
Read(file_path: "~/.pwagent/config.json")
```

Extract the `repos` array. Each entry has:
- `name` — repo identifier
- `remoteUrl` — used for git remote matching
- `ado.org`, `ado.project`, `ado.areaPath` — ADO coordinates
- `ado.mcpServer` — which MCP server to use (`dynamicscrm-repo` or `msazure-repo`)

If the config file is missing or `repos` is empty, ask the user:

> "No repos are configured in `~/.pwagent/config.json`. Which ADO org and project should I query? Please provide the org URL (e.g. `https://dynamicscrm.visualstudio.com`) and project name."

---

## Step 2: Detect Current Repo Context (optional)

If the working directory is inside a git repo, try to match it to a configured repo:

```bash
git remote get-url origin 2>/dev/null
```

Match the returned URL against `repos[*].remoteUrl`. If matched, note the active repo for context. If not matched, proceed without filtering — show all repos.

---

## Step 3: Query Open Accessibility Bugs Per Repo

For each repo (or the one specified by `$0`):

Determine the transport:

```bash
az boards --version >/dev/null 2>&1 && echo "CLI" || echo "MCP"
```

**Via CLI:**
```bash
az boards query \
  --wiql "SELECT [System.Id], [System.Title], [System.State], [System.AssignedTo], [Microsoft.VSTS.Common.Priority] FROM WorkItems WHERE [System.TeamProject] = '<ADO_PROJECT>' AND [System.WorkItemType] = 'Bug' AND [System.State] IN ('Active', 'New') AND ([System.Tags] CONTAINS 'a11y' OR [System.Tags] CONTAINS 'accessibility') AND [System.AreaPath] UNDER '<ADO_AREA_PATH>' ORDER BY [Microsoft.VSTS.Common.Priority] ASC" \
  --org <ADO_ORG> \
  --project <ADO_PROJECT>
```

**Via MCP** (use `mcp__<ado.mcpServer>__wit_query_by_wiql`):
```
mcp__<mcpServer>__wit_query_by_wiql(
  query: "SELECT [System.Id], [System.Title], [System.State], [System.AssignedTo], [Microsoft.VSTS.Common.Priority] FROM WorkItems WHERE [System.TeamProject] = '<ADO_PROJECT>' AND [System.WorkItemType] = 'Bug' AND [System.State] IN ('Active', 'New') AND ([System.Tags] CONTAINS 'a11y' OR [System.Tags] CONTAINS 'accessibility') AND [System.AreaPath] UNDER '<ADO_AREA_PATH>' ORDER BY [Microsoft.VSTS.Common.Priority] ASC"
)
```

If `ado.mcpServer` is not configured for a repo and CLI is also unavailable, ask:

> "I can't determine the MCP server for repo `<name>`. Is this repo in `dynamicscrm.visualstudio.com` or `msazure.visualstudio.com`?"

---

## Step 4: Output

**Summary view (no argument):**

```markdown
## Configured ADO Repositories

| Repo | Org | Area Path | Open A11y Bugs |
|------|-----|-----------|----------------|
| [<name>](<remoteUrl>) | <org> | <areaPath> | N |
...

**Total open accessibility bugs: N**

To see bugs in a repo: `pwagent run ado/list-repos <repo-name>`
To read a specific bug: `pwagent run ado/get-bug <id>`
To create a new bug: `pwagent run ado/create-bug <repo-name> "<title>"`
```

**Detail view (repo specified):**

```markdown
## <REPO_NAME> — Open Accessibility Bugs

| # | ID | Title | Priority | Assigned To | Tags |
|---|-----|-------|----------|-------------|------|
| 1 | [#12345](<ADO_ORG>/<ADO_PROJECT>/_workitems/edit/12345) | [A11y] Missing button labels | 1 | alias | accessibility; a11y |
```
