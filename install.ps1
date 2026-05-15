# pwagent installer
# Usage: iex "& { $(irm https://raw.githubusercontent.com/deepakkamboj/pwagent/main/install.ps1) }"
#
# Clones both repos as siblings so file: workspace links resolve correctly:
#   ~/.pwagent/repos/pwagent/   <- this repo
#   ~/.pwagent/repos/squad/     <- deepakkamboj/squad fork (squad-cli + squad-scheduler)

$ErrorActionPreference = 'Stop'

Write-Host ""
Write-Host "  Installing pwagent..." -ForegroundColor Magenta
Write-Host ""

# Node 22+ required
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "  [ERROR] Node.js 22+ is required." -ForegroundColor Red
    Write-Host "          Install: winget install OpenJS.NodeJS.LTS" -ForegroundColor Gray
    exit 1
}
$nodeVersion = (node --version) -replace 'v', ''
$nodeMajor   = [int]($nodeVersion.Split('.')[0])
if ($nodeMajor -lt 22) {
    Write-Host "  [ERROR] Node.js 22+ required (found $nodeVersion)." -ForegroundColor Red
    Write-Host "          Install: winget install OpenJS.NodeJS.LTS" -ForegroundColor Gray
    exit 1
}

# git required
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "  [ERROR] git is required." -ForegroundColor Red
    Write-Host "          Install: winget install Git.Git" -ForegroundColor Gray
    exit 1
}

$reposRoot  = Join-Path $env:USERPROFILE ".pwagent\repos"
$pwagentDir = Join-Path $reposRoot "pwagent"
$squadDir   = Join-Path $reposRoot "squad"

New-Item -ItemType Directory -Force -Path $reposRoot | Out-Null

# ── clone / update squad fork (provides squad-cli + squad-scheduler) ────────
Write-Host "  Setting up squad fork..." -ForegroundColor Cyan
if (Test-Path (Join-Path $squadDir ".git")) {
    Push-Location $squadDir
    git pull --ff-only
    Pop-Location
} else {
    git clone --branch dev https://github.com/deepakkamboj/squad.git $squadDir
}

Write-Host "  Building squad packages..." -ForegroundColor Cyan
Push-Location $squadDir
npm install --silent
npm run build --workspace packages/squad-cli --silent
npm run build --workspace packages/squad-scheduler --silent
Pop-Location

# ── clone / update pwagent ───────────────────────────────────────────────────
Write-Host "  Setting up pwagent..." -ForegroundColor Cyan
if (Test-Path (Join-Path $pwagentDir ".git")) {
    Push-Location $pwagentDir
    git pull --ff-only
    Pop-Location
} else {
    git clone https://github.com/deepakkamboj/pwagent.git $pwagentDir
}

Write-Host "  Installing dependencies and building..." -ForegroundColor Cyan
Push-Location $pwagentDir
# Both repos are siblings under ~/.pwagent/repos/ so file:../../squad/... resolves correctly
npm install --silent
npm run build --silent
npm link --workspace cli
Pop-Location

Write-Host ""
Write-Host "  pwagent installed!" -ForegroundColor Green
Write-Host ""
Write-Host "  Repos:"
Write-Host "    pwagent  $pwagentDir" -ForegroundColor Gray
Write-Host "    squad    $squadDir" -ForegroundColor Gray
Write-Host ""
Write-Host "  Get started:" -ForegroundColor White
Write-Host "    pwagent prereqs --install   # install gh, az, axe-core, etc." -ForegroundColor Gray
Write-Host "    pwagent login               # authenticate with GitHub Copilot" -ForegroundColor Gray
Write-Host "    pwagent doctor              # verify everything is ready" -ForegroundColor Gray
Write-Host "    pwagent                     # open the chat shell" -ForegroundColor Gray
Write-Host ""
