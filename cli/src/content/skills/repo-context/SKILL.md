---
name: repo-context
description: 'Per-runId repo binding. Agents do NOT auto-detect the repo from cwd — hooks/bind-repo.ps1 resolves --repo / defaultRepo at sessionStart and publishes the bound context to a sidecar JSON that every agent reads.'
allowed-tools: Read
---

# Repo Context — hook-resolved (R5 + R6)

Repo selection is **explicit**, not derived from `git remote get-url origin`. The active repo comes from one of:

1. `--repo <name>` argument on the slash command (operator types it)
2. `.defaultRepo` in `~/.copilot/state/config.json` (admin pre-sets per machine)
3. Otherwise — `hooks/bind-repo.ps1` writes an unresolved sentinel; agents halt and ask.

This skill exists for **agents to read the sidecar**, not to compute it. The deterministic resolution + lookup is in [hooks/bind-repo.ps1](../../hooks/bind-repo.ps1) (per N2 — deterministic work is off the LLM).

## What the hook publishes

`hooks/bind-repo.ps1` fires on `userPromptSubmitted` and writes `~/.copilot/state/runs/<runId>/.repo-context.json` with this shape:

```json
{
  "resolved": true,
  "repoName": "CRM.Client.UnifiedClient",
  "repoUrl": "https://...",
  "primaryBranch": "master",
  "areaPath": "Proj\\Client\\UnifiedClient",
  "iteration": "Proj\\Current",
  "bugTags": "playwright; auto-fix",
  "defaultAssignee": "alice",
  "adoOrg": "https://dev.azure.com/contoso",
  "adoProject": "ProjectX",
  "kustoCluster": "https://contoso.kusto.windows.net/",
  "kustoDatabase": "TelemetryDb",
  "pipelines": { "ci": 23865, "nightly": 23878, "weekly": 23863, "multiPr": 23890 },
  "testEnv": {
    "appUrl": "https://...",
    "authEmail": "...",
    "certPath": "...",
    "storageStatePath": "state-storage-auth-file.json",
    "testCommand": "npx playwright test"
  }
}
```

If `resolved` is `false`, the agent halts with the sidecar's `reason` field (e.g. "no --repo and no defaultRepo").

If the named repo isn't in `config.json` `.repositories[]`, the hook writes `.hook-fatal` and the agent halts in its first Startup step.

## Agent usage — first checklist step

Every agent does this once at the top of its workflow (the agents already do this — see their `## Startup` block):

```bash
# 1. Halt if hook flagged a fatal
RUN_DIR="$HOME/.copilot/state/runs/$RUN_ID"
[ -f "$RUN_DIR/.hook-fatal" ] && { cat "$RUN_DIR/.hook-fatal"; exit 1; }

# 2. Read the bound context
CTX="$RUN_DIR/.repo-context.json"
if ! jq -e .resolved "$CTX" >/dev/null 2>&1; then
    echo "repo-context not resolved. $(jq -r .reason "$CTX")"
    exit 1
fi

# 3. Bind the variables the agent needs
REPO_NAME=$(jq -r .repoName "$CTX")
AREA_PATH=$(jq -r .areaPath "$CTX")
ADO_ORG=$(jq -r .adoOrg "$CTX")
KUSTO_CLUSTER=$(jq -r .kustoCluster "$CTX")
# ... and so on
```

PowerShell equivalent:

```powershell
$ctx = Get-Content "$env:USERPROFILE\.copilot\state\runs\$env:RUN_ID\.repo-context.json" | ConvertFrom-Json
if (-not $ctx.resolved) { throw "repo-context unresolved: $($ctx.reason)" }
$REPO_NAME = $ctx.repoName
$AREA_PATH = $ctx.areaPath
```

## Bug routing — separate sidecar

`/pwagent-triage` needs to map a failing test's file path → ADO area path. That's a different sidecar written by [hooks/route-bug.ps1](../../hooks/route-bug.ps1):

```bash
# Agent stages the request by writing the pending marker:
echo '{ "filePath": "src/packages/contacts/SaveContact.tsx" }' > "$RUN_DIR/.pending-routing.json"

# Next postToolUse fires route-bug.ps1, which writes:
jq . "$RUN_DIR/.bug-routing.json"
# { "areaPath": "Proj\\Contacts", "assignee": "alice", "tags": "playwright; contacts", ... }
```

## Env-marker signals — separate sidecar

`/pwagent-triage` reads `.env-signals.json` (written by `hooks/env-marker-scan.ps1` after each test-run `postToolUse`). See triage.agent.md step 2 for the aggregation logic.

## What this skill explicitly DOES NOT do

- **Does not** auto-detect repo from cwd. Operators set `--repo` explicitly or rely on `defaultRepo`. See SPEC.md §15.3.
- **Does not** mutate `config.json`. The hook reads it; agents read the bound sidecar; nobody re-derives.
- **Does not** repeat the bind logic. There is one source of truth: `hooks/bind-repo.ps1`. Agents are consumers.

## When the hook hasn't run yet

If the operator skipped `prompt-submitted` somehow (raw ACP `session/prompt` without going through the runtime's hook chain), no sidecar exists. Agents detect this:

```bash
[ -f "$RUN_DIR/.repo-context.json" ] || {
    echo "ERROR: hooks/bind-repo.ps1 did not run. Re-invoke via 'copilot ask' (which fires S2 events) or set --repo manually."
    exit 1
}
```

Halt in this case — the agent has no business deriving repo context.
