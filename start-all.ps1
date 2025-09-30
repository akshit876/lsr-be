# PowerShell script to start all services
Write-Host "Starting Laser System..." -ForegroundColor Green
Write-Host "========================" -ForegroundColor Green

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
        $process = Start-Process -FilePath "cmd" -ArgumentList "/c", $Command -PassThru -WindowStyle Hidden
        Write-Host "$Name started with PID: $($process.Id)" -ForegroundColor Green
        
        if ($WaitTime -gt 0) {
            Write-Host "Waiting $WaitTime seconds for $Name to initialize..." -ForegroundColor Cyan
            Start-Sleep -Seconds $WaitTime
        }
        
        return $process
    }
    catch {
        Write-Host "Failed to start $Name`: $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

# Start Main Server
$mainServer = Start-Service -Name "Main Server" -Path "D:\lsr-be" -Command "npm run start" -WaitTime 10

# Start Alarm Service
$alarmService = Start-Service -Name "Alarm Service" -Path "D:\lsr-be" -Command "npm run alarm-independent" -WaitTime 5

# Start Frontend
$frontend = Start-Service -Name "Frontend" -Path "D:\MecObsr" -Command "npm run start" -WaitTime 25

# Open Chrome
Write-Host "Opening Chrome..." -ForegroundColor Yellow
try {
    Start-Process "C:\Program Files\Google\Chrome\Application\chrome.exe" -ArgumentList "--incognito", "http://localhost:3000"
    Write-Host "Chrome opened successfully" -ForegroundColor Green
}
catch {
    Write-Host "Failed to open Chrome: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "========================" -ForegroundColor Green
Write-Host "All services started!" -ForegroundColor Green
Write-Host "- Main Server: http://localhost:3002" -ForegroundColor Cyan
Write-Host "- Alarm Service: http://localhost:3001" -ForegroundColor Cyan
Write-Host "- Frontend: http://localhost:3000" -ForegroundColor Cyan
Write-Host "========================" -ForegroundColor Green
Write-Host ""
Write-Host "Press any key to exit..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
