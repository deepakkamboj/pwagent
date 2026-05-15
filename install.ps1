# pwagent installer
# Usage: iex "& { $(irm https://raw.githubusercontent.com/deepakkamboj/pwagent/main/install.ps1) }"

$ErrorActionPreference = 'Stop'

Write-Host ""
Write-Host "  Installing pwagent..." -ForegroundColor Magenta
Write-Host ""

# Node 22+ required
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "  [ERROR] Node.js 22+ is required." -ForegroundColor Red
    Write-Host "          Install it from https://nodejs.org or run: winget install OpenJS.NodeJS.LTS" -ForegroundColor Gray
    exit 1
}

$nodeVersion = (node --version) -replace 'v', ''
$nodeMajor = [int]($nodeVersion.Split('.')[0])
if ($nodeMajor -lt 22) {
    Write-Host "  [ERROR] Node.js 22+ required (found $nodeVersion)." -ForegroundColor Red
    Write-Host "          Run: winget install OpenJS.NodeJS.LTS" -ForegroundColor Gray
    exit 1
}

# git required
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "  [ERROR] git is required." -ForegroundColor Red
    Write-Host "          Install it from https://git-scm.com or run: winget install Git.Git" -ForegroundColor Gray
    exit 1
}

$installDir = Join-Path $env:USERPROFILE ".pwagent\src"

if (Test-Path (Join-Path $installDir ".git")) {
    Write-Host "  Updating existing installation at $installDir" -ForegroundColor Cyan
    Push-Location $installDir
    git pull --ff-only
} else {
    Write-Host "  Cloning pwagent to $installDir" -ForegroundColor Cyan
    New-Item -ItemType Directory -Force -Path $installDir | Out-Null
    git clone https://github.com/deepakkamboj/pwagent.git $installDir
    Push-Location $installDir
}

Write-Host "  Installing dependencies..." -ForegroundColor Cyan
npm install --silent

Write-Host "  Building..." -ForegroundColor Cyan
npm run build --silent

Write-Host "  Linking pwagent globally..." -ForegroundColor Cyan
npm link --workspace cli

Pop-Location

Write-Host ""
Write-Host "  pwagent installed!" -ForegroundColor Green
Write-Host ""
Write-Host "  Get started:" -ForegroundColor White
Write-Host "    pwagent prereqs --install   # install gh, az, axe-core, etc." -ForegroundColor Gray
Write-Host "    pwagent login               # authenticate with GitHub Copilot" -ForegroundColor Gray
Write-Host "    pwagent doctor              # verify everything is ready" -ForegroundColor Gray
Write-Host "    pwagent                     # open the chat shell" -ForegroundColor Gray
Write-Host ""
