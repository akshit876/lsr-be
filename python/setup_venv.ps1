# PowerShell script to set up conda environment
# Make sure conda is initialized: conda init powershell (if not already done)

Write-Host "Checking for conda..." -ForegroundColor Yellow
$condaCheck = Get-Command conda -ErrorAction SilentlyContinue
if (-not $condaCheck) {
    Write-Host "ERROR: conda command not found!" -ForegroundColor Red
    Write-Host "Please ensure conda is installed and initialized:" -ForegroundColor Yellow
    Write-Host "  1. Install Anaconda or Miniconda" -ForegroundColor Yellow
    Write-Host "  2. Run: conda init powershell" -ForegroundColor Yellow
    Write-Host "  3. Restart PowerShell and run this script again" -ForegroundColor Yellow
    exit 1
}

Write-Host "Creating conda environment in current folder..." -ForegroundColor Green
conda env create -f environment.yml -p .\venv

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to create conda environment. Trying alternative method..." -ForegroundColor Yellow
    conda create -p .\venv python=3.10 -y
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Failed to create conda environment" -ForegroundColor Red
        exit 1
    }
}

Write-Host "Activating conda environment..." -ForegroundColor Green
conda activate .\venv

Write-Host "Installing additional pip packages..." -ForegroundColor Green
pip install -r requirements.txt

Write-Host "Installing PySpin from wheel..." -ForegroundColor Green
$wheelPath = "spinnaker_python-4.2.0.88-cp310-cp310-win_amd64\spinnaker_python-4.2.0.88-cp310-cp310-win_amd64.whl"
if (Test-Path $wheelPath) {
    pip install $wheelPath
    Write-Host "PySpin installed successfully!" -ForegroundColor Green
} else {
    Write-Host "Warning: PySpin wheel not found at $wheelPath" -ForegroundColor Yellow
    Write-Host "You may need to install PySpin manually" -ForegroundColor Yellow
}

Write-Host "`nSetup complete! To activate the conda environment in the future, run:" -ForegroundColor Cyan
Write-Host "  conda activate .\venv" -ForegroundColor Yellow

