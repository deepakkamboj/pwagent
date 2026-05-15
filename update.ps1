# pwagent updater
# Usage: iex "& { $(irm https://raw.githubusercontent.com/deepakkamboj/pwagent/main/update.ps1) }"

$ErrorActionPreference = "Stop"

function Write-Step($n, $total, $msg) { Write-Host "`n-- Step $n/$total : $msg --" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  [!!] $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "  [FAIL] $msg" -ForegroundColor Red }

Write-Host ""
Write-Host "  pwagent -- Updater" -ForegroundColor Magenta
Write-Host "  ==================" -ForegroundColor Magenta
Write-Host ""

$installDir = Join-Path $env:USERPROFILE ".pwagent\repos\pwagent"

# ── Guard: must be installed ──────────────────────────────────────────────────
if (-not (Test-Path (Join-Path $installDir ".git"))) {
    Write-Err "pwagent is not installed at $installDir"
    Write-Host "  Run the installer first:" -ForegroundColor Gray
    Write-Host '  iex "& { $(irm https://raw.githubusercontent.com/deepakkamboj/pwagent/main/install.ps1) }"' -ForegroundColor Gray
    exit 1
}

# Show current version
Push-Location $installDir
$pkg = Get-Content "cli\package.json" | ConvertFrom-Json
Write-Host "  Current version: $($pkg.version)" -ForegroundColor Gray
Write-Host ""

# ── Step 1: Pull latest ───────────────────────────────────────────────────────
Write-Step 1 3 "Pull latest"

$ErrorActionPreference = "Continue"
git fetch origin
$fetchExit = $LASTEXITCODE
$ErrorActionPreference = "Stop"
if ($fetchExit -ne 0) { Write-Err "git fetch failed."; Pop-Location; exit 1 }

$local  = (git rev-parse HEAD 2>$null).Trim()
$remote = (git rev-parse "@{u}" 2>$null).Trim()

if ($local -eq $remote) {
    Write-Ok "Already up to date ($($local.Substring(0,7)))"
} else {
    $ErrorActionPreference = "Continue"
    git pull --ff-only
    $pullExit = $LASTEXITCODE
    $ErrorActionPreference = "Stop"
    if ($pullExit -ne 0) { Write-Err "git pull failed. Resolve conflicts manually."; Pop-Location; exit 1 }
    $newPkg = Get-Content "cli\package.json" | ConvertFrom-Json
    Write-Ok "Updated to v$($newPkg.version)"
}

# ── Step 2: Install deps ──────────────────────────────────────────────────────
Write-Step 2 3 "Install dependencies"

Write-Host "  Running npm install..." -ForegroundColor Gray
$ErrorActionPreference = "Continue"
npm install
$npmExit = $LASTEXITCODE
$ErrorActionPreference = "Stop"
if ($npmExit -ne 0) { Write-Err "npm install failed."; Pop-Location; exit 1 }
Write-Ok "Dependencies installed"

# ── Step 3: Rebuild and re-link ───────────────────────────────────────────────
Write-Step 3 3 "Build and Link"

Write-Host "  Building..." -ForegroundColor Gray
$ErrorActionPreference = "Continue"
npm run build --workspace cli
$buildExit = $LASTEXITCODE
$ErrorActionPreference = "Stop"
if ($buildExit -ne 0) { Write-Err "Build failed."; Pop-Location; exit 1 }
Write-Ok "Build complete"

Write-Host "  Re-linking 'pwagent' command..." -ForegroundColor Gray
$ErrorActionPreference = "Continue"
npm link --workspace cli
$linkExit = $LASTEXITCODE
$ErrorActionPreference = "Stop"
if ($linkExit -ne 0) { Write-Err "npm link failed. Try running as Administrator."; Pop-Location; exit 1 }
Write-Ok "'pwagent' command linked"

Pop-Location

# ── Done ──────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  +------------------------------------------+" -ForegroundColor Green
Write-Host "  |  pwagent updated successfully!           |" -ForegroundColor Green
Write-Host "  +------------------------------------------+" -ForegroundColor Green
Write-Host ""
Write-Host "  Run 'pwagent' to start." -ForegroundColor Gray
Write-Host ""
