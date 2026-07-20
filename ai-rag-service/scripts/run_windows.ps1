param(
    [string]$HostAddress = "127.0.0.1",
    [int]$Port = 8000,
    [switch]$NoReload
)

$ErrorActionPreference = "Stop"
$ServiceRoot = Split-Path -Parent $PSScriptRoot
$VenvPython = Join-Path $ServiceRoot ".venv\Scripts\python.exe"

if (-not (Test-Path $VenvPython)) {
    throw "Virtual environment not found. Run .\scripts\setup_windows.ps1 first."
}

$Arguments = @("-m", "uvicorn", "app.main:app", "--host", $HostAddress, "--port", $Port)
if (-not $NoReload) {
    $Arguments += "--reload"
}

Push-Location $ServiceRoot
try {
    & $VenvPython @Arguments
}
finally {
    Pop-Location
}
