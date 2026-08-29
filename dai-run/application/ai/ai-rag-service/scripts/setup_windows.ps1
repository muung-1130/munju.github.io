param(
    [string]$PythonCommand = "python"
)

$ErrorActionPreference = "Stop"
$ServiceRoot = Split-Path -Parent $PSScriptRoot
$VenvPython = Join-Path $ServiceRoot ".venv\Scripts\python.exe"

Push-Location $ServiceRoot
try {
    if (-not (Test-Path $VenvPython)) {
        Write-Host "Creating .venv with $PythonCommand..."
        & $PythonCommand -m venv .venv
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to create the Python virtual environment."
        }
    }

    Write-Host "Installing Python dependencies..."
    & $VenvPython -m pip install --upgrade pip
    if ($LASTEXITCODE -ne 0) { throw "Failed to upgrade pip." }
    & $VenvPython -m pip install -r requirements.txt
    if ($LASTEXITCODE -ne 0) { throw "Failed to install requirements." }

    if (-not (Test-Path ".env")) {
        Copy-Item ".env.example" ".env"
        Write-Host "Created .env from .env.example. Add your AWS and DB settings there."
    }

    & $VenvPython -m pip check
    if ($LASTEXITCODE -ne 0) { throw "Installed packages are inconsistent." }

    Write-Host "Windows setup complete. Run .\scripts\run_windows.ps1"
}
finally {
    Pop-Location
}
