/**
 * MCP server definitions for pwagent.
 *
 * MCP servers are not CLIs — they're configured in Claude Code's settings as
 * named server entries that expose tools. pwagent agents call these tools via
 * the `mcp__<server-id>__<tool-name>` pattern.
 *
 * Surface these to users via `pwagent prereqs --mcps` (report) or
 * `pwagent prereqs --mcps --show-config` (print Claude settings snippet).
 *
 * @see docs/pages/getting-started/prerequisites.mdx — MCP servers section
 */

export type MCPTier =
  /** Required for specific agents — those agents are non-functional without it. */
  | "required-for"
  /** Enhances capability but agent has a fallback path (e.g. CLI instead of MCP). */
  | "optional";

export interface MCPServer {
  /** Stable ID — must match the server key in Claude MCP config. */
  id: string;
  /** Human label shown in `pwagent prereqs --mcps` output. */
  label: string;
  /** Prefix used in agent charters — e.g. "mcp__kusto__". */
  toolPrefix: string;
  /** Why pwagent needs this MCP. */
  reason: string;
  /** Which agents require or benefit from this server. */
  usedBy: string[];
  tier: MCPTier;
  /** Docs URL for setup instructions. */
  setupUrl: string;
  /**
   * Canonical tool names exposed by this server (non-exhaustive — list the
   * ones agents actually call so `pwagent doctor` can verify they're available).
   */
  tools: string[];
  /**
   * Example entry for Claude Code's `~/.claude/claude_desktop_config.json`
   * (or workspace-level `.claude/settings.json`).
   * Replace placeholder values before use.
   */
  configExample: {
    command: string;
    args?: string[];
    env?: Record<string, string>;
  };
}

export const MCP_SERVERS: MCPServer[] = [
  {
    id: "kusto",
    label: "Kusto MCP",
    toolPrefix: "mcp__kusto__",
    reason:
      "Runs KQL queries against Azure Data Explorer clusters. Used by pwagent-s360 to fetch S360 action items (cluster: s360prodro.kusto.windows.net / db: service360db) and by pwagent-analyze for flake history (PowerApps-Engineering cluster).",
    usedBy: ["pwagent-s360", "pwagent-analyze", "pwagent-triage"],
    tier: "required-for",
    setupUrl: "https://aka.ms/kusto-mcp-setup",
    tools: ["mcp__kusto__kusto_query"],
    // Real package: @azure/mcp — namespace kusto
    configExample: {
      command: "npx",
      args: ["-y", "@azure/mcp@latest", "server", "start", "--namespace", "kusto", "--read-only"],
    },
  },
  {
    id: "s360",
    label: "S360 MCP",
    toolPrefix: "mcp__s360__",
    reason:
      "Read and write Service 360 action item state. Used by pwagent-s360 to update ETA and status after a fix is verified and the PR is merged.",
    usedBy: ["pwagent-s360"],
    tier: "required-for",
    setupUrl: "https://aka.ms/s360-mcp-setup",
    tools: ["mcp__s360__set_s360_action_item_eta_and_status"],
    // HTTP server — no local command needed
    configExample: {
      command: "http",
      args: ["https://mcp.vnext.s360.msftcloudes.com/"],
    },
  },
  {
    id: "dynamicscrm-repo",
    label: "ADO MCP — DynamicsCRM org",
    toolPrefix: "mcp__dynamicscrm-repo__",
    reason:
      "Read/write ADO work items (bugs, tasks) and create pull requests in the DynamicsCRM ADO org (dynamicscrm.visualstudio.com). Used by pwagent-s360, pwagent-a11y --verify-fix, and pwagent-publish when the workspace repo lives in this org.",
    usedBy: ["pwagent-s360", "pwagent-a11y", "pwagent-publish"],
    tier: "required-for",
    setupUrl: "https://aka.ms/ado-mcp-setup",
    tools: [
      "mcp__dynamicscrm-repo__wit_create_work_item",
      "mcp__dynamicscrm-repo__wit_update_work_item",
      "mcp__dynamicscrm-repo__wit_create_work_item_comment",
      "mcp__dynamicscrm-repo__git_create_pull_request",
    ],
    // Real package: @azure-devops/mcp — org slug as first arg
    configExample: {
      command: "npx",
      args: ["-y", "@azure-devops/mcp@latest", "dynamicscrm"],
    },
  },
  {
    id: "msazure-repo",
    label: "ADO MCP — msazure org",
    toolPrefix: "mcp__msazure-repo__",
    reason:
      "Read/write ADO work items and PRs in the msazure ADO org (msazure.visualstudio.com). Same capability as dynamicscrm-repo but for the msazure org. Configure the one that matches your workspace's ADO org.",
    usedBy: ["pwagent-s360", "pwagent-a11y", "pwagent-publish"],
    tier: "required-for",
    setupUrl: "https://aka.ms/ado-mcp-setup",
    tools: [
      "mcp__msazure-repo__wit_create_work_item",
      "mcp__msazure-repo__wit_update_work_item",
      "mcp__msazure-repo__wit_create_work_item_comment",
      "mcp__msazure-repo__git_create_pull_request",
    ],
    // Real package: @azure-devops/mcp — org slug as first arg
    configExample: {
      command: "npx",
      args: ["-y", "@azure-devops/mcp@latest", "msazure"],
    },
  },
  {
    id: "playwright-mcp",
    label: "Playwright MCP",
    toolPrefix: "mcp__playwright__",
    reason:
      "Browser automation via MCP — used as the fallback transport when `npx playwright` CLI is unavailable. Also used by playwright-login skill for Power Platform SSO auth flows.",
    usedBy: ["pwagent-a11y", "pwagent-auth"],
    tier: "optional",
    setupUrl: "https://playwright.dev/docs/mcp",
    tools: ["mcp__playwright__navigate", "mcp__playwright__screenshot", "mcp__playwright__click"],
    configExample: {
      command: "npx",
      args: [
        "@playwright/mcp@latest",
        "--isolated",
        "--browser=msedge",
        "--storage-state=./.playwright/auth.json",
      ],
    },
  },
];

/**
 * Returns the subset of MCP servers required by a given agent name.
 * Useful for `pwagent doctor <agent>` to surface only relevant MCPs.
 */
export function mcpsForAgent(agentName: string): MCPServer[] {
  return MCP_SERVERS.filter((m) => m.usedBy.includes(agentName));
}
