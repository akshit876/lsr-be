# PowerShell script to start development environment
Write-Host "========================================" -ForegroundColor Green
Write-Host "   LASER SYSTEM - DEVELOPMENT MODE" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

# Function to start a service
function Start-Service {
    param(
        [string]$Name,
        [string]$Path,
        [string]$Command,
        [int]$WaitTime = 5
    )
    
    Write-Host "Starting $Name..." -ForegroundColor Yellow
    Set-Location $Path
    
    try {
        $process = Start-Process -FilePath "cmd" -ArgumentList "/k", "title $Name && $Command" -PassThru
        Write-Host "✅ $Name started with PID: $($process.Id)" -ForegroundColor Green
        
        if ($WaitTime -gt 0) {
            Write-Host "Waiting $WaitTime seconds for $Name to initialize..." -ForegroundColor Cyan
            Start-Sleep -Seconds $WaitTime
        }
        
        return $process
    }
    catch {
        Write-Host "❌ Failed to start $Name`: $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

# Check directories
Write-Host "Checking directories..." -ForegroundColor Yellow
if (-not (Test-Path "D:\lsr-be")) {
    Write-Host "❌ ERROR: D:\lsr-be directory not found!" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

if (-not (Test-Path "D:\MecObsr")) {
    Write-Host "❌ ERROR: D:\MecObsr directory not found!" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "✅ Directories found" -ForegroundColor Green

# Start Alarm Service
Write-Host ""
Write-Host "[1/3] Starting Alarm Service..." -ForegroundColor Yellow
$alarmService = Start-Service -Name "🚨 Alarm Service" -Path "D:\lsr-be" -Command "npm run alarm-independent" -WaitTime 5

# Start Frontend
Write-Host ""
Write-Host "[2/3] Starting Frontend UI..." -ForegroundColor Yellow
$frontend = Start-Service -Name "🌐 Frontend UI" -Path "D:\MecObsr" -Command "npm run dev" -WaitTime 15

# Open Chrome
Write-Host ""
Write-Host "[3/3] Opening Chrome..." -ForegroundColor Yellow
try {
    Start-Process "C:\Program Files\Google\Chrome\Application\chrome.exe" -ArgumentList "--incognito", "http://localhost:3000"
    Write-Host "✅ Chrome opened" -ForegroundColor Green
}
catch {
    Write-Host "❌ Failed to open Chrome: $($_.Exception.Message)" -ForegroundColor Red
}

# Summary
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "   DEVELOPMENT ENVIRONMENT READY!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Services Running:" -ForegroundColor Cyan
Write-Host "- 🚨 Alarm Service: http://localhost:3001" -ForegroundColor White
Write-Host "- 🌐 Frontend UI: http://localhost:3000" -ForegroundColor White
Write-Host ""
Write-Host "Console Windows:" -ForegroundColor Cyan
Write-Host "- Alarm Service: Check for safety violations" -ForegroundColor White
Write-Host "- Frontend UI: Check for build status" -ForegroundColor White
Write-Host ""
Write-Host "Press any key to exit this launcher..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
