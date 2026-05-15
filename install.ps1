# pwagent installer
# Usage: iex "& { $(irm https://raw.githubusercontent.com/deepakkamboj/pwagent/main/install.ps1) }"

$ErrorActionPreference = 'Stop'

Write-Host ""
Write-Host "  Installing pwagent..." -ForegroundColor Magenta
Write-Host ""

# ── helpers ───────────────────────────────────────────────────────────────────
function Refresh-Path {
    $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
                [System.Environment]::GetEnvironmentVariable('Path', 'User')
}

function Get-NodeMajor {
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) { return 0 }
    $ver = (node --version 2>$null) -replace 'v', ''
    return [int]($ver.Split('.')[0])
}

# ── Node 22+ ──────────────────────────────────────────────────────────────────
$nodeMajor = Get-NodeMajor
if ($nodeMajor -lt 22) {
    if ($nodeMajor -eq 0) {
        Write-Host "  Node.js not found — installing..." -ForegroundColor Cyan
    } else {
        Write-Host "  Node.js $nodeMajor found — upgrading to LTS 22+..." -ForegroundColor Cyan
    }

    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Write-Host "  [ERROR] winget not found. Install Node.js 22+ manually: https://nodejs.org" -ForegroundColor Red
        exit 1
    }

    winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements --silent
    Refresh-Path

    $nodeMajor = Get-NodeMajor
    if ($nodeMajor -lt 22) {
        Write-Host ""
        Write-Host "  Node.js installed but not yet in PATH." -ForegroundColor Yellow
        Write-Host "  Please open a new terminal and re-run the installer:" -ForegroundColor Yellow
        Write-Host "    iex `"& { `$(irm https://raw.githubusercontent.com/deepakkamboj/pwagent/main/install.ps1) }`"" -ForegroundColor Gray
        exit 0
    }

    Write-Host "  Node.js $(node --version) ready." -ForegroundColor Green
}

# ── git ───────────────────────────────────────────────────────────────────────
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "  git not found — installing..." -ForegroundColor Cyan

    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Write-Host "  [ERROR] winget not found. Install git manually: https://git-scm.com" -ForegroundColor Red
        exit 1
    }

    winget install --id Git.Git -e --accept-source-agreements --accept-package-agreements --silent
    Refresh-Path

    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        Write-Host ""
        Write-Host "  git installed but not yet in PATH." -ForegroundColor Yellow
        Write-Host "  Please open a new terminal and re-run the installer." -ForegroundColor Yellow
        exit 0
    }

    Write-Host "  git $(git --version) ready." -ForegroundColor Green
}

# ── clone / update pwagent ────────────────────────────────────────────────────
$installDir = Join-Path $env:USERPROFILE ".pwagent\repos\pwagent"
New-Item -ItemType Directory -Force -Path (Split-Path $installDir) | Out-Null

Write-Host "  Setting up pwagent..." -ForegroundColor Cyan
if (Test-Path (Join-Path $installDir ".git")) {
    Push-Location $installDir
    git pull --ff-only
    Pop-Location
} else {
    git clone https://github.com/deepakkamboj/pwagent.git $installDir
}

# ── install deps (pulls squad packages from GitHub fork automatically) ────────
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
