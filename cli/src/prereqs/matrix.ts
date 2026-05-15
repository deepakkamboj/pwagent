export type Tier = "required" | "recommended" | "optional";
export type Installer =
  | { kind: "winget"; id: string }
  | { kind: "brew"; id: string; cask?: boolean }
  | { kind: "apt"; pkg: string; sudo?: boolean }
  | { kind: "dnf"; pkg: string; sudo?: boolean }
  | { kind: "pacman"; pkg: string; sudo?: boolean }
  | { kind: "npm-global"; pkg: string }
  | { kind: "gh-extension"; pkg: string }
  | { kind: "gh-login" }
  | { kind: "az-extension"; name: string }
  | { kind: "playwright-browsers" }
  | { kind: "manual"; url: string };

export type Detector =
  | { kind: "cmd"; cmd: string; args: string[]; versionPattern?: RegExp }
  | { kind: "gh-ext"; name: string };

export interface Prereq {
  /** Stable lookup key, e.g. "gh-copilot". */
  id: string;
  /** Display label, e.g. "gh copilot extension". */
  label: string;
  /** What pwagent uses this for — surfaces in feature impact. */
  reason: string;
  tier: Tier;
  /** Detection: probe command and how to parse a version from it. */
  detect: Detector;
  /** Per-platform installer choices, evaluated in order. First viable one runs. */
  installers: Installer[];
  /** Feature names this prereq unlocks (shown by `pwagent doctor`). */
  unlocks: string[];
}

export const PREREQS: Prereq[] = [
  {
    id: "node",
    label: "node (≥22)",
    reason: "Runtime for pwagent. @github/copilot-sdk requires Node 22+ (uses built-in node:sqlite).",
    tier: "required",
    // Detect: parse the version, then verify ≥22. The versionPattern captures the major; we
    // post-check in detect.ts via the prereq's own check.
    detect: { kind: "cmd", cmd: "node", args: ["--version"], versionPattern: /v?(\d+)\.\d+\.\d+/ },
    installers: [{ kind: "manual", url: "https://nodejs.org/en/download" }],
    unlocks: ["pwagent"],
  },
  {
    id: "git",
    label: "git",
    reason: "Reading repos, applying patches, branching",
    tier: "required",
    detect: { kind: "cmd", cmd: "git", args: ["--version"], versionPattern: /git version (\d+\.\d+\.\d+)/ },
    installers: [
      { kind: "winget", id: "Git.Git" },
      { kind: "brew", id: "git" },
      { kind: "apt", pkg: "git", sudo: true },
      { kind: "dnf", pkg: "git", sudo: true },
      { kind: "pacman", pkg: "git", sudo: true },
    ],
    unlocks: ["repo-ops"],
  },
  {
    id: "gh",
    label: "gh",
    reason: "Required for Copilot auth (gh auth login). Also: PR creation, Issues, repo discovery.",
    tier: "required",
    detect: { kind: "cmd", cmd: "gh", args: ["--version"], versionPattern: /gh version (\d+\.\d+\.\d+)/ },
    installers: [
      { kind: "winget", id: "GitHub.cli" },
      { kind: "brew", id: "gh" },
      { kind: "apt", pkg: "gh", sudo: true },
      { kind: "dnf", pkg: "gh", sudo: true },
      { kind: "pacman", pkg: "github-cli", sudo: true },
    ],
    unlocks: ["copilot auth", "GitHub PRs", "GitHub Issues"],
  },
  {
    id: "gh-auth",
    label: "gh auth (logged in)",
    reason: "GitHub Copilot subscription must be active. `gh auth login` once per machine.",
    tier: "required",
    detect: { kind: "cmd", cmd: "gh", args: ["auth", "status"] },
    installers: [{ kind: "gh-login" }],
    unlocks: ["copilot auth"],
  },
  {
    id: "playwright",
    label: "playwright",
    reason: "validator / fixer / author run npx playwright test",
    tier: "recommended",
    detect: { kind: "cmd", cmd: "npx", args: ["playwright", "--version"], versionPattern: /(\d+\.\d+\.\d+)/ },
    installers: [{ kind: "npm-global", pkg: "@playwright/test" }],
    unlocks: ["test execution"],
  },
  {
    id: "playwright-browsers",
    label: "playwright browsers",
    reason: "Headless Chromium / Firefox / WebKit for actual runs",
    tier: "recommended",
    detect: { kind: "cmd", cmd: "npx", args: ["playwright", "install", "--dry-run"], versionPattern: /chromium|firefox|webkit/i },
    installers: [{ kind: "playwright-browsers" }],
    unlocks: ["test execution"],
  },
  {
    id: "az",
    label: "az",
    reason: "ADO triage + PR creation (core workflow). Also Kusto auth, ADO wiki, ADO test runs.",
    tier: "required",
    detect: { kind: "cmd", cmd: "az", args: ["--version"], versionPattern: /azure-cli\s+(\d+\.\d+\.\d+)/ },
    installers: [
      { kind: "winget", id: "Microsoft.AzureCLI" },
      { kind: "brew", id: "azure-cli" },
      { kind: "apt", pkg: "azure-cli", sudo: true },
      { kind: "manual", url: "https://learn.microsoft.com/cli/azure/install-azure-cli" },
    ],
    unlocks: ["ADO triage", "ADO PRs"],
  },
  {
    id: "az-pipelines",
    label: "az pipelines ext",
    reason: "Pipeline run details for triage. Installed once via `az extension add --name azure-devops`.",
    tier: "required",
    detect: { kind: "cmd", cmd: "az", args: ["extension", "show", "--name", "azure-devops"] },
    installers: [{ kind: "az-extension", name: "azure-devops" }],
    unlocks: ["ADO pipeline triage"],
  },
  {
    id: "axe",
    label: "@axe-core/cli",
    reason: "Live-URL WCAG scanning. pwagent-a11y --scan, --scan-repo, --verify-fix and pwagent-validate --a11y all shell out to `npx axe`.",
    tier: "required",
    detect: { kind: "cmd", cmd: "npx", args: ["axe", "--version"], versionPattern: /(\d+\.\d+\.\d+)/ },
    installers: [{ kind: "npm-global", pkg: "@axe-core/cli" }],
    unlocks: ["a11y scan", "a11y verify-fix", "validate --a11y"],
  },
  {
    id: "axe-playwright",
    label: "@axe-core/playwright",
    reason: "Playwright-integrated axe scans. pwagent-a11y --test-gen and --review interactive generate AxeBuilder tests. Add as a devDependency in each test project: `npm i -D @axe-core/playwright`.",
    tier: "recommended",
    // Detect inside the current workspace — exits 0 if resolvable, non-zero if absent.
    detect: { kind: "cmd", cmd: "node", args: ["-e", "require.resolve('@axe-core/playwright')"] },
    installers: [{ kind: "npm-global", pkg: "@axe-core/playwright" }],
    unlocks: ["a11y test-gen", "a11y review-interactive"],
  },
  {
    id: "kusto",
    label: "kusto CLI",
    reason: "Kusto queries (flake history, telemetry, run summaries). Used by triage and report.",
    tier: "required",
    detect: { kind: "cmd", cmd: "kusto.cli", args: ["--version"] },
    installers: [{ kind: "manual", url: "https://aka.ms/kustofree" }],
    unlocks: ["flake finder"],
  },
  {
    id: "vscode",
    label: "VS Code",
    reason: "Only needed for the @pwagent chat wrapper",
    tier: "optional",
    detect: { kind: "cmd", cmd: "code", args: ["--version"], versionPattern: /(\d+\.\d+\.\d+)/ },
    installers: [
      { kind: "winget", id: "Microsoft.VisualStudioCode" },
      { kind: "brew", id: "visual-studio-code", cask: true },
      { kind: "manual", url: "https://code.visualstudio.com/download" },
    ],
    unlocks: ["chat wrapper"],
  },
];
