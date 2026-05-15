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

$installDir = Join-Path $env:USERPROFILE ".pwagent\repos\pwagent"
$globalDir  = Join-Path $env:USERPROFILE ".pwagent"

# ── Unlink global 'pwagent' command ───────────────────────────────────────────
if (Test-Path (Join-Path $installDir "package.json")) {
    Write-Host "  Removing global 'pwagent' command..." -ForegroundColor Gray
    $ErrorActionPreference = "Continue"
    Push-Location $installDir
    npm unlink --workspace cli 2>$null
    Pop-Location
    $ErrorActionPreference = "Stop"
    Write-Ok "'pwagent' command removed"
} else {
    Write-Warn "pwagent repo not found at $installDir -- skipping unlink"
}

# ── Remove cloned repo ────────────────────────────────────────────────────────
if (Test-Path $installDir) {
    Write-Host "  Removing repo at $installDir..." -ForegroundColor Gray
    Remove-Item -Recurse -Force $installDir
    Write-Ok "Repo removed"

    $reposDir = Split-Path $installDir
    if ((Get-ChildItem $reposDir -ErrorAction SilentlyContinue | Measure-Object).Count -eq 0) {
        Remove-Item -Force $reposDir
    }
} else {
    Write-Warn "Repo not found at $installDir -- skipping"
}

# ── Offer to remove config / data ─────────────────────────────────────────────
Write-Host ""
Write-Host "  Config and data are stored at: $globalDir" -ForegroundColor Gray
Write-Host "  (squad.brand.json, scheduler state, logs, etc.)" -ForegroundColor Gray
Write-Host ""
$answer = Read-Host "  Remove all pwagent config and data? [y/N]"
if ($answer -match "^[Yy]") {
    if (Test-Path $globalDir) {
        Remove-Item -Recurse -Force $globalDir
        Write-Ok "Config and data removed ($globalDir)"
    }
} else {
    Write-Host "  Config and data kept at $globalDir" -ForegroundColor Gray
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
