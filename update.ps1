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

try {

# ── Step 1: Check current version ─────────────────────────────────────────────
Write-Step 1 2 "Check version"

$currentVer = $null
try { $currentVer = (pwagent --version 2>$null) | Select-Object -First 1 } catch {}
if ($currentVer) {
    Write-Host "  Current version: $currentVer" -ForegroundColor Gray
} else {
    Write-Warn "pwagent not found -- running installer instead"
    Invoke-Expression "& { $(Invoke-RestMethod https://raw.githubusercontent.com/deepakkamboj/pwagent/main/install.ps1) }"
    return
}

# ── Step 2: Reinstall latest ──────────────────────────────────────────────────
Write-Step 2 2 "Update to latest"

Write-Host "  Running: npm install -g github:deepakkamboj/pwagent-cli#main" -ForegroundColor Gray
$ErrorActionPreference = "Continue"
npm install -g github:deepakkamboj/pwagent-cli#main
$npmExit = $LASTEXITCODE
$ErrorActionPreference = "Stop"
if ($npmExit -ne 0) { throw "npm install failed." }

$newVer = $null
try { $newVer = (pwagent --version 2>$null) | Select-Object -First 1 } catch {}
Write-Ok "Updated to $newVer"

Write-Host ""
Write-Host "  +------------------------------------------+" -ForegroundColor Green
Write-Host "  |  pwagent updated successfully!           |" -ForegroundColor Green
Write-Host "  +------------------------------------------+" -ForegroundColor Green
Write-Host ""
Write-Host "  Run 'pwagent' to start." -ForegroundColor Gray

} catch {
    Write-Host ""
    Write-Err $_.Exception.Message
}

Write-Host ""
Write-Host "  Press Enter to close..." -ForegroundColor Gray
$null = Read-Host
