# pwagent uninstaller
# Usage: iex "& { $(irm https://raw.githubusercontent.com/deepakkamboj/pwagent/main/uninstall.ps1) }"

$ErrorActionPreference = "Stop"

function Write-Ok($msg)   { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  [!!] $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "  [FAIL] $msg" -ForegroundColor Red }

Write-Host ""
Write-Host "  pwagent -- Uninstaller" -ForegroundColor Magenta
Write-Host "  ======================" -ForegroundColor Magenta
Write-Host ""

try {

# ── Remove global 'pwagent' command ───────────────────────────────────────────
Write-Host "  Removing global 'pwagent' command..." -ForegroundColor Gray
$ErrorActionPreference = "Continue"
npm uninstall -g @pwagent/cli 2>$null
$ErrorActionPreference = "Stop"
Write-Ok "'pwagent' command removed"

# ── Offer to remove config / data ─────────────────────────────────────────────
$globalDir = Join-Path $env:USERPROFILE ".pwagent"
if (Test-Path $globalDir) {
    Write-Host ""
    Write-Host "  Config and data are stored at: $globalDir" -ForegroundColor Gray
    Write-Host "  (squad.brand.json, scheduler state, logs, etc.)" -ForegroundColor Gray
    Write-Host ""
    $answer = Read-Host "  Remove all pwagent config and data? [y/N]"
    if ($answer -match "^[Yy]") {
        Remove-Item -Recurse -Force $globalDir
        Write-Ok "Config and data removed ($globalDir)"
    } else {
        Write-Host "  Config and data kept at $globalDir" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "  pwagent uninstalled." -ForegroundColor Green

} catch {
    Write-Host ""
    Write-Err $_.Exception.Message
}

Write-Host ""
Write-Host "  Press Enter to close..." -ForegroundColor Gray
$null = Read-Host
