# Optimized PowerShell script to start all services with health checks
Write-Host "Starting Laser System (Optimized)..." -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green

# Function to check if a service is ready
function Test-ServiceReady {
    param(
        [string]$Url,
        [int]$MaxAttempts = 30,
        [int]$DelaySeconds = 1
    )
    
    $attempt = 0
    do {
        $attempt++
        Write-Host "Checking $Url... (attempt $attempt/$MaxAttempts)" -ForegroundColor Cyan
        
        try {
            $response = Invoke-WebRequest -Uri $Url -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
            if ($response.StatusCode -eq 200) {
                Write-Host "✅ Service at $Url is ready!" -ForegroundColor Green
                return $true
            }
        }
        catch {
            # Service not ready yet, continue waiting
        }
        
        if ($attempt -lt $MaxAttempts) {
            Start-Sleep -Seconds $DelaySeconds
        }
    } while ($attempt -lt $MaxAttempts)
    
    Write-Host "❌ Service at $Url not ready after $MaxAttempts attempts" -ForegroundColor Red
    return $false
}

# Function to start a service
function Start-Service {
    param(
        [string]$Name,
        [string]$Path,
        [string]$Command,
        [string]$HealthCheckUrl
    )
    
    Write-Host "🚀 Starting $Name..." -ForegroundColor Yellow
    Set-Location $Path
    
    try {
        $process = Start-Process -FilePath "cmd" -ArgumentList "/c", $Command -PassThru -WindowStyle Minimized
        Write-Host "$Name started with PID: $($process.Id)" -ForegroundColor Green
        
        # Wait for service to be ready
        if ($HealthCheckUrl) {
            if (-not (Test-ServiceReady -Url $HealthCheckUrl)) {
                Write-Host "❌ Failed to start $Name" -ForegroundColor Red
                return $null
            }
        }
        
        return $process
    }
    catch {
        Write-Host "❌ Failed to start $Name`: $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

# Start services with health checks
$mainServer = Start-Service -Name "Main Server" -Path "D:\lsr-be" -Command "npm run start" -HealthCheckUrl "http://localhost:3002"
if (-not $mainServer) { exit 1 }

$alarmService = Start-Service -Name "Alarm Service" -Path "D:\lsr-be" -Command "npm run alarm-independent" -HealthCheckUrl "http://localhost:3001"
if (-not $alarmService) { exit 1 }

$frontend = Start-Service -Name "Frontend" -Path "D:\MecObsr" -Command "npm run start" -HealthCheckUrl "http://localhost:3000"
if (-not $frontend) { exit 1 }

# Open Chrome immediately after all services are ready
Write-Host "🌐 Opening Chrome..." -ForegroundColor Yellow
try {
    Start-Process "C:\Program Files\Google\Chrome\Application\chrome.exe" -ArgumentList "--incognito", "http://localhost:3000"
    Write-Host "✅ Chrome opened successfully" -ForegroundColor Green
}
catch {
    Write-Host "❌ Failed to open Chrome: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "=====================================" -ForegroundColor Green
Write-Host "✅ All services started and ready!" -ForegroundColor Green
Write-Host "- Main Server: http://localhost:3002" -ForegroundColor Cyan
Write-Host "- Alarm Service: http://localhost:3001" -ForegroundColor Cyan
Write-Host "- Frontend: http://localhost:3000" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Green
Write-Host ""
Write-Host "Press any key to exit..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
