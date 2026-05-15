---
name: auth
description: Pre-flight check for all CLI tools and MCP servers required by pwagent. Verifies gh auth, az login, az devops extension, and MCP server availability. Run once per session before using any ADO, S360, or scan skill.
argument-hint: ""
---

Pre-flight check — detect and verify all tools and MCP servers pwagent depends on.
Run once before using any skill in this pack.

## Usage

```
pwagent run auth
```

---

## Step 1: Check GitHub CLI auth (`gh`)

```bash
gh auth status 2>&1
```

- Logged in → note `GH_AUTH=ok`, record the active account
- Not logged in or token expired → note `GH_AUTH=missing`, prompt:

  ```bash
  gh auth login --web
  ```

  `gh` is required for the Copilot SDK and for creating GitHub PRs.
  Run `pwagent prereqs --install gh` if the CLI itself is missing.

---

## Step 2: Check Azure CLI auth (`az`)

```bash
az account show 2>/dev/null
```

Check that the output shows a valid subscription and tenant.

- Active account returned → note `AZ_AUTH=ok`
- Error or empty → note `AZ_AUTH=missing`, prompt the user to run:

  ```bash
  az login
  ```

  `az` is required for ADO work-item queries and PR creation.
  Run `pwagent prereqs --install az` if the CLI itself is missing.

---

## Step 3: Check `az devops` extension

```bash
az extension show --name azure-devops 2>/dev/null
```

- Extension present → note `ADO_CLI=available`
- Missing → install and configure:

  ```bash
  az extension add --name azure-devops --only-show-errors
  ```

  The extension is needed for `az boards` and `az repos` commands.
  Run `pwagent prereqs --install az-pipelines` to install via pwagent.

---

## Step 4: Check MCP servers in Claude Code settings

```
Read(file_path: "~/.claude/claude_desktop_config.json")
```

Check for each required server in the `mcpServers` object:

| Server ID | Key to look for | Purpose |
|-----------|----------------|---------|
| `kusto` | `mcpServers.kusto` | KQL queries — S360 action items, flake history |
| `s360` | `mcpServers.s360` | Update S360 action item ETA and status |
| `dynamicscrm-repo` | `mcpServers.dynamicscrm-repo` | ADO bugs + PRs in dynamicscrm.visualstudio.com |
| `msazure-repo` | `mcpServers.msazure-repo` | ADO bugs + PRs in msazure.visualstudio.com |
| `playwright` | `mcpServers.playwright` | Browser automation (optional fallback) |

For any missing server, show the snippet to add:

**`kusto`** (required by `pwagent-s360`, `pwagent-analyze`, `pwagent-triage`):
```json
"kusto": {
  "command": "npx",
  "args": ["-y", "@azure/mcp@latest", "server", "start", "--namespace", "kusto", "--read-only"]
}
```

**`s360`** (required by `pwagent-s360`):
```json
"s360": {
  "type": "http",
  "url": "https://mcp.vnext.s360.msftcloudes.com/"
}
```

**`dynamicscrm-repo`** (required for `dynamicscrm.visualstudio.com` repos):
```json
"dynamicscrm-repo": {
  "command": "npx",
  "args": ["-y", "@azure-devops/mcp@latest", "dynamicscrm"]
}
```

**`msazure-repo`** (required for `msazure.visualstudio.com` repos):
```json
"msazure-repo": {
  "command": "npx",
  "args": ["-y", "@azure-devops/mcp@latest", "msazure"]
}
```

**`playwright`** (optional — browser automation fallback):
```json
"playwright": {
  "command": "npx",
  "args": ["@playwright/mcp@latest", "--isolated", "--browser=msedge", "--storage-state=./.playwright/auth.json"]
}
```

Configure the ADO MCP for the org your repos live in — you don't need both.
After adding any server, restart Claude Code for it to load.

Full setup details: `pwagent prereqs --mcps --show-config`

---

## Step 5: Check axe-cli

```bash
npx axe --version 2>/dev/null || echo "NOT_FOUND"
```

- Found → note `AXE_CLI=available`
- NOT_FOUND → note `AXE_CLI=missing`

  ```bash
  pwagent prereqs --install axe
  ```

  Required by `pwagent-a11y --scan`, `--verify-fix`, and `pwagent-validate --a11y`. No MCP fallback.

---

## Step 6: Check Playwright CLI

```bash
npx playwright --version 2>/dev/null || echo "NOT_FOUND"
```

If found → note `PLAYWRIGHT_CLI=available`. Check browsers:

```bash
npx playwright install --dry-run 2>/dev/null | grep "chromium" | head -2
```

If browsers not installed:

```bash
npx playwright install chromium
```

If NOT_FOUND → note `PLAYWRIGHT_CLI=missing`:

```bash
pwagent prereqs --install playwright
```

> MCP alternative: `playwright` MCP server handles browser automation when CLI is absent.

---

## Step 7: Output Summary

```markdown
## pwagent Auth — Session Ready

| Tool | Status | Notes |
|------|--------|-------|
| gh (GitHub CLI)                  | ✅/❌ | Auth for Copilot SDK + GitHub PRs |
| gh auth (logged in)              | ✅/❌ | Active account: <email> |
| az (Azure CLI)                   | ✅/❌ | — |
| az account (logged in)           | ✅/❌ | Active subscription: <name> |
| az devops extension              | ✅/❌ | `az boards` / `az repos` |
| kusto MCP                        | ✅/❌ | S360 + flake queries |
| s360 MCP                         | ✅/❌ | S360 action item updates |
| dynamicscrm-repo MCP             | ✅/❌ | ADO bugs + PRs (dynamicscrm) |
| msazure-repo MCP                 | ✅/❌ | ADO bugs + PRs (msazure) |
| playwright MCP                   | ✅/❌ | Browser automation (optional) |
| axe-cli                          | ✅/❌ | WCAG scanning (required) |
| Playwright CLI                   | ✅/❌ | Test runner |
| Playwright browsers (Chromium)   | ✅/❌ | — |

### ADO Transport: <CLI (`az boards`) OR MCP>
### S360 Transport: `mcp__s360__*` + `mcp__kusto__*`

For a full feature matrix and any ✗ items:
```

```bash
pwagent doctor
```

If any required tool is missing (axe-cli, s360 MCP, kusto MCP), list the affected agents/skills and stop. Don't silently continue with a degraded environment.
