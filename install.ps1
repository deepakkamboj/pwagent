# pwagent installer
# Usage: iex "& { $(irm https://raw.githubusercontent.com/deepakkamboj/pwagent/main/install.ps1) }"

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

$installDir = Join-Path $env:USERPROFILE ".pwagent\repos\pwagent"

New-Item -ItemType Directory -Force -Path (Split-Path $installDir) | Out-Null

# ── clone / update pwagent ───────────────────────────────────────────────────
Write-Host "  Setting up pwagent..." -ForegroundColor Cyan
if (Test-Path (Join-Path $installDir ".git")) {
    Push-Location $installDir
    git pull --ff-only
    Pop-Location
} else {
    git clone https://github.com/deepakkamboj/pwagent.git $installDir
}

# ── install deps (pulls squad packages from GitHub fork automatically) ───────
Write-Host "  Installing dependencies..." -ForegroundColor Cyan
Push-Location $installDir
npm install --silent

# ── copy config files to ~/.pwagent/ (skip if already present) ───────────────
$globalDir = Join-Path $env:USERPROFILE ".pwagent"
New-Item -ItemType Directory -Force -Path $globalDir | Out-Null

foreach ($file in @("squad.brand.json", "squad.schedule.json", "pwagent.config.example.json")) {
    $src  = Join-Path $installDir $file
    $dest = Join-Path $globalDir $file
    if ((Test-Path $src) -and -not (Test-Path $dest)) {
        Copy-Item $src $dest
        Write-Host "  Copied $file to $globalDir" -ForegroundColor Gray
    }
}

# ── build and link ────────────────────────────────────────────────────────────
Write-Host "  Building..." -ForegroundColor Cyan
npm run build --workspace cli --silent
npm link --workspace cli
Pop-Location

Write-Host ""
Write-Host "  pwagent installed!" -ForegroundColor Green
Write-Host ""
Write-Host "  Installed to: $installDir" -ForegroundColor Gray
Write-Host ""
Write-Host "  Get started:" -ForegroundColor White
Write-Host "    pwagent prereqs --install   # install gh, az, axe-core, etc." -ForegroundColor Gray
Write-Host "    pwagent login               # authenticate with GitHub Copilot" -ForegroundColor Gray
Write-Host "    pwagent doctor              # verify everything is ready" -ForegroundColor Gray
Write-Host "    pwagent                     # open the chat shell" -ForegroundColor Gray
Write-Host ""
