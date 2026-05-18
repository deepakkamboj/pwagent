# pwagent installer
# Usage: iex "& { $(irm https://raw.githubusercontent.com/deepakkamboj/pwagent/main/install.ps1) }"
#
# This script:
#   1. Checks/installs prerequisites (Node.js 22+, git, GitHub CLI)
#   2. Authenticates GitHub CLI
#   3. npm install -g github:deepakkamboj/pwagent-cli#main
#   4. Copies default config files to ~/.pwagent/

$ErrorActionPreference = "Stop"
$script:needsRestart = $false

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

function Install-Node22 {
    Write-Host "  Fetching latest Node.js 22 LTS version info..." -ForegroundColor Gray
    try {
        $nodeIndex = Invoke-RestMethod "https://nodejs.org/dist/index.json"
        $node22    = $nodeIndex | Where-Object { $_.lts -and $_.version -like 'v22.*' } | Select-Object -First 1
        if (-not $node22) { throw "Could not find Node.js 22 LTS in release index." }

        $arch    = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "arm64" } else { "x64" }
        $msiUrl  = "https://nodejs.org/dist/$($node22.version)/node-$($node22.version)-$arch.msi"
        $msiPath = Join-Path $env:TEMP "nodejs22.msi"

        Write-Host "  Downloading Node.js $($node22.version) ($arch)..." -ForegroundColor Gray
        Invoke-WebRequest -Uri $msiUrl -OutFile $msiPath -UseBasicParsing

        Write-Host "  Installing Node.js $($node22.version) (a UAC prompt may appear)..." -ForegroundColor Gray
        Start-Process msiexec -ArgumentList "/i `"$msiPath`" /quiet /norestart ADDLOCAL=ALL" -Verb RunAs -Wait
        Remove-Item $msiPath -Force -ErrorAction SilentlyContinue
        Refresh-Path

        if (Test-Command "node") {
            $ver = (node --version 2>$null) -replace '^v', ''
            Write-Ok "Node.js $($node22.version) installed -- v$ver"
            return "ok"
        } else {
            Write-Warn "Node.js installed but not yet on PATH -- restart required"
            return "restart"
        }
    } catch {
        Write-Warn "Auto-install failed: $($_.Exception.Message)"
        Write-Host "  Install Node.js 22 manually: https://nodejs.org/en/download" -ForegroundColor Gray
        return "failed"
    }
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
Write-Host ""

try {

# ── Step 1: Prerequisites ─────────────────────────────────────────────────────
Write-Step 1 4 "Prerequisites"

# Node.js 22+ (required) -- install via MSI from nodejs.org
$nodePresent = Test-Command "node"
if ($nodePresent) {
    $nodeVer = (node --version 2>$null) -replace '^v', ''
    $major   = [int]($nodeVer.Split('.')[0])
    if ($major -ge 22) {
        Write-Ok "node -- v$nodeVer"
    } else {
        Write-Warn "Node.js v$nodeVer is too old -- pwagent requires Node.js 22+"
        $r = Install-Node22
        if ($r -eq "restart") { $script:needsRestart = $true }
        if ($r -eq "failed")  { throw "Node.js 22 is required. Install from https://nodejs.org/en/download" }
    }
} else {
    Write-Warn "node not found (Required)"
    $answer = Read-Host "  Install Node.js 22 LTS? [Y/n]"
    if ($answer -and $answer -notmatch "^[Yy]") { throw "Node.js 22 is required. Install from https://nodejs.org/en/download" }
    $r = Install-Node22
    if ($r -eq "restart") { $script:needsRestart = $true }
    if ($r -eq "failed")  { throw "Node.js 22 is required. Install from https://nodejs.org/en/download" }
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

# ── Step 3: Install pwagent globally ──────────────────────────────────────────
Write-Step 3 4 "Install pwagent"

Write-Host "  Running: npm install -g github:deepakkamboj/pwagent-cli#main" -ForegroundColor Gray
Write-Host "  (downloads pwagent + squad packages -- no build required)..." -ForegroundColor Gray
$ErrorActionPreference = "Continue"
npm install -g github:deepakkamboj/pwagent-cli#main
$npmExit = $LASTEXITCODE
$ErrorActionPreference = "Stop"
if ($npmExit -ne 0) {
    $logDir = Join-Path (npm config get cache 2>$null) "_logs"
    if ($logDir -and (Test-Path $logDir)) {
        $latest = Get-ChildItem $logDir -Filter "*.log" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($latest) {
            Write-Host ""
            Write-Host "  npm error log ($($latest.Name)):" -ForegroundColor Gray
            Get-Content $latest.FullName | Select-String "^[0-9]+ error " | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
        }
    }
    throw "npm install failed."
}
Write-Ok "'pwagent' command installed globally"

# ── Step 4: Default config files ──────────────────────────────────────────────
Write-Step 4 4 "Config files"

$globalDir  = Join-Path $env:USERPROFILE ".pwagent"
$rawBase    = "https://raw.githubusercontent.com/deepakkamboj/pwagent/main"
New-Item -ItemType Directory -Force -Path $globalDir | Out-Null

foreach ($file in @("squad.brand.json", "squad.schedule.json", "pwagent.config.example.json")) {
    $dest = Join-Path $globalDir $file
    if (-not (Test-Path $dest)) {
        try {
            Invoke-WebRequest -Uri "$rawBase/$file" -OutFile $dest -UseBasicParsing
            Write-Ok "Copied $file -> $globalDir"
        } catch {
            Write-Warn "Could not fetch $file -- $($_.Exception.Message)"
        }
    } else {
        Write-Ok "$file already present (skipped)"
    }
}

# ── Done ──────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  +------------------------------------------+" -ForegroundColor Green
Write-Host "  |  pwagent installed successfully!         |" -ForegroundColor Green
Write-Host "  +------------------------------------------+" -ForegroundColor Green
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
