# pwagent installer
# Usage: iex "& { $(irm https://raw.githubusercontent.com/deepakkamboj/pwagent/main/install.ps1) }"
#
# This script:
#   1. Checks/installs prerequisites (Node.js 22+, git, GitHub CLI)
#   2. Authenticates GitHub CLI
#   3. Clones / updates pwagent
#   4. Installs dependencies, builds, and links the 'pwagent' command globally

param(
    [ValidateSet("stable", "dev")]
    [string]$Channel = "stable"
)

$ErrorActionPreference = "Stop"
$script:needsRestart = $false
$branch = if ($Channel -eq "dev") { "dev" } else { "main" }

function Write-Step($n, $total, $msg) { Write-Host "`n-- Step $n/$total : $msg --" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  [!!] $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "  [FAIL] $msg" -ForegroundColor Red }

function Refresh-Path {
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("PATH", "User")
}

function Test-Command($cmd) {
    try { & $cmd --version 2>$null | Out-Null; return $true } catch { return $false }
}

function Install-Prereq($name, $wingetId, $required) {
    if (Test-Command $name) {
        $ver = (& $name --version 2>$null) | Select-Object -First 1
        Write-Ok "$name -- $ver"
        return "ok"
    }

    $label = if ($required) { "Required" } else { "Recommended" }
    Write-Warn "$name not found ($label)"

    $answer = Read-Host "  Install $name via winget? [Y/n]"
    if ($answer -and $answer -notmatch "^[Yy]") {
        if ($required) {
            Write-Err "$name is required. Install manually: winget install $wingetId"
            return "failed"
        }
        Write-Host "  Skipped." -ForegroundColor Gray
        return "skipped"
    }

    Write-Host "  Installing $name..." -ForegroundColor Gray
    $ok = $false
    try {
        winget install --id $wingetId -e --accept-source-agreements --accept-package-agreements 2>$null
        Refresh-Path
        $ok = $true
    } catch { $ok = $false }

    if ($ok -and (Test-Command $name)) {
        $ver = (& $name --version 2>$null) | Select-Object -First 1
        Write-Ok "$name installed -- $ver"
        return "ok"
    } elseif ($ok) {
        Write-Warn "$name installed but not yet visible on PATH"
        return "restart"
    } else {
        Write-Err "Failed to install $name. Install manually: winget install $wingetId"
        return if ($required) { "failed" } else { "skipped" }
    }
}

# ── Header ────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  pwagent -- Installer" -ForegroundColor Magenta
Write-Host "  ====================" -ForegroundColor Magenta
Write-Host "  Channel: $Channel (branch: $branch)" -ForegroundColor Magenta
Write-Host ""

try {

# ── Step 1: Prerequisites ─────────────────────────────────────────────────────
Write-Step 1 4 "Prerequisites"

# Node.js (required)
$nodeResult = Install-Prereq "node" "OpenJS.NodeJS.LTS" $true
if ($nodeResult -eq "failed") { throw "Node.js is required." }
if ($nodeResult -eq "restart") { $script:needsRestart = $true }

# Verify Node.js >= 22; upgrade if too old
if ($nodeResult -eq "ok") {
    $nodeVer = (node --version 2>$null) -replace '^v', ''
    $major   = [int]($nodeVer.Split('.')[0])
    if ($major -lt 22) {
        Write-Warn "Node.js v$nodeVer is too old -- pwagent requires Node.js 22+"
        Write-Host "  Fetching latest Node.js 22 LTS version info..." -ForegroundColor Gray
        try {
            $nodeIndex = Invoke-RestMethod "https://nodejs.org/dist/index.json"
            $node22    = $nodeIndex | Where-Object { $_.lts -and $_.version -like 'v22.*' } | Select-Object -First 1
            if (-not $node22) { throw "Could not find Node.js 22 LTS in release index." }

            $arch   = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "arm64" } else { "x64" }
            $msiUrl = "https://nodejs.org/dist/$($node22.version)/node-$($node22.version)-$arch.msi"
            $msiPath = Join-Path $env:TEMP "nodejs22.msi"

            Write-Host "  Downloading Node.js $($node22.version)..." -ForegroundColor Gray
            Invoke-WebRequest -Uri $msiUrl -OutFile $msiPath -UseBasicParsing

            Write-Host "  Installing Node.js $($node22.version) (a UAC prompt may appear)..." -ForegroundColor Gray
            Start-Process msiexec -ArgumentList "/i `"$msiPath`" /quiet /norestart" -Verb RunAs -Wait
            Remove-Item $msiPath -Force -ErrorAction SilentlyContinue

            Write-Ok "Node.js $($node22.version) installed"
        } catch {
            Write-Warn "Auto-install failed: $($_.Exception.Message)"
            Write-Host "  Install Node.js 22 manually: https://nodejs.org/en/download" -ForegroundColor Gray
        }
        $script:needsRestart = $true
    }
}

# git (required)
$gitResult = Install-Prereq "git" "Git.Git" $true
if ($gitResult -eq "failed") { throw "git is required." }
if ($gitResult -eq "restart") { $script:needsRestart = $true }

# GitHub CLI (required for Copilot authentication)
$ghResult = Install-Prereq "gh" "GitHub.cli" $true
if ($ghResult -eq "failed") { throw "GitHub CLI is required." }
if ($ghResult -eq "restart") { $script:needsRestart = $true }

# ── Restart gate ──────────────────────────────────────────────────────────────
if ($script:needsRestart) {
    Write-Host ""
    Write-Host "  +------------------------------------------------------+" -ForegroundColor Yellow
    Write-Host "  |  Some tools were installed but aren't on PATH yet.    |" -ForegroundColor Yellow
    Write-Host "  |                                                        |" -ForegroundColor Yellow
    Write-Host "  |  Please:                                               |" -ForegroundColor Yellow
    Write-Host "  |    1. Close this terminal                              |" -ForegroundColor Yellow
    Write-Host "  |    2. Open a NEW terminal                              |" -ForegroundColor Yellow
    Write-Host "  |    3. Re-run the installer -- it will pick up here.    |" -ForegroundColor Yellow
    Write-Host "  |                                                        |" -ForegroundColor Yellow
    Write-Host '  |  iex "& { $(irm https://raw.githubusercontent.com' -ForegroundColor Gray
    Write-Host '  |    /deepakkamboj/pwagent/main/install.ps1) }"' -ForegroundColor Gray
    Write-Host "  |                                                        |" -ForegroundColor Yellow
    Write-Host "  +------------------------------------------------------+" -ForegroundColor Yellow
    return
}

# ── Step 2: GitHub Authentication ─────────────────────────────────────────────
Write-Step 2 4 "GitHub Authentication"

$authOk = $false
try { gh auth status 2>$null | Out-Null; if ($LASTEXITCODE -eq 0) { $authOk = $true } } catch {}

if ($authOk) {
    Write-Ok "GitHub CLI already authenticated"
} else {
    Write-Host "  GitHub CLI needs authentication -- a browser window will open." -ForegroundColor Yellow
    Write-Host ""
    gh auth login
    if ($LASTEXITCODE -ne 0) { throw "Authentication failed. Run 'gh auth login' manually then re-run." }
    Write-Ok "GitHub CLI authenticated"
}

# ── Step 3: Clone / update pwagent ────────────────────────────────────────────
Write-Step 3 4 "Clone pwagent"

$installDir = Join-Path $env:USERPROFILE ".pwagent\repos\pwagent"
New-Item -ItemType Directory -Force -Path (Split-Path $installDir) | Out-Null

if (Test-Path (Join-Path $installDir ".git")) {
    Write-Host "  Updating existing clone..." -ForegroundColor Gray
    Push-Location $installDir
    git checkout $branch 2>$null
    git pull --ff-only
    Pop-Location
    Write-Ok "pwagent updated ($installDir)"
} else {
    Write-Host "  Cloning pwagent..." -ForegroundColor Gray
    git clone --branch $branch https://github.com/deepakkamboj/pwagent.git $installDir
    Write-Ok "pwagent cloned to $installDir"
}

# Copy config files to ~/.pwagent/ (skip if already customised)
$globalDir = Join-Path $env:USERPROFILE ".pwagent"
New-Item -ItemType Directory -Force -Path $globalDir | Out-Null
foreach ($file in @("squad.brand.json", "squad.schedule.json", "pwagent.config.example.json")) {
    $src  = Join-Path $installDir $file
    $dest = Join-Path $globalDir $file
    if ((Test-Path $src) -and -not (Test-Path $dest)) {
        Copy-Item $src $dest
        Write-Ok "Copied $file -> $globalDir"
    }
}

# ── Step 4: Install, Build, Link ──────────────────────────────────────────────
Write-Step 4 4 "Install, Build, and Link"

Push-Location $installDir

Write-Host "  Running npm install (fetches squad packages from GitHub fork)..." -ForegroundColor Gray
$ErrorActionPreference = "Continue"
npm install
$npmExit = $LASTEXITCODE
$ErrorActionPreference = "Stop"
if ($npmExit -ne 0) { throw "npm install failed." }
Write-Ok "Dependencies installed"

Write-Host "  Building..." -ForegroundColor Gray
$ErrorActionPreference = "Continue"
npm run build --workspace cli
$buildExit = $LASTEXITCODE
$ErrorActionPreference = "Stop"
if ($buildExit -ne 0) { throw "Build failed." }
Write-Ok "Build complete"

Write-Host "  Linking 'pwagent' command globally..." -ForegroundColor Gray
$ErrorActionPreference = "Continue"
npm link --workspace cli
$linkExit = $LASTEXITCODE
$ErrorActionPreference = "Stop"
if ($linkExit -ne 0) { throw "npm link failed. Try running as Administrator." }
Write-Ok "'pwagent' command linked globally"

Pop-Location

# ── Done ──────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  +------------------------------------------+" -ForegroundColor Green
Write-Host "  |  pwagent installed successfully!         |" -ForegroundColor Green
Write-Host "  +------------------------------------------+" -ForegroundColor Green
Write-Host ""
Write-Host "  Installed to: $installDir" -ForegroundColor Gray
Write-Host ""
Write-Host "  Get started:" -ForegroundColor White
Write-Host "    pwagent prereqs --install   # install gh, az, axe-core, etc." -ForegroundColor Gray
Write-Host "    pwagent login               # authenticate with GitHub Copilot" -ForegroundColor Gray
Write-Host "    pwagent doctor              # verify everything is ready" -ForegroundColor Gray
Write-Host "    pwagent                     # open the chat shell" -ForegroundColor Gray

} catch {
    Write-Host ""
    Write-Err $_.Exception.Message
}

Write-Host ""
Write-Host "  Press Enter to close..." -ForegroundColor Gray
$null = Read-Host
