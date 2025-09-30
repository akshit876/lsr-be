# Parallel startup script - starts all services simultaneously
Write-Host "Starting Laser System (Parallel Mode)..." -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green

# Function to start a service in background
function Start-ServiceBackground {
    param(
        [string]$Name,
        [string]$Path,
        [string]$Command,
        [string]$HealthCheckUrl
    )
    
    Write-Host "🚀 Starting $Name..." -ForegroundColor Yellow
    
    $job = Start-Job -ScriptBlock {
        param($Name, $Path, $Command, $HealthCheckUrl)
        
        Set-Location $Path
        $process = Start-Process -FilePath "cmd" -ArgumentList "/c", $Command -PassThru -WindowStyle Hidden
        
        # Wait for service to be ready
        if ($HealthCheckUrl) {
            $attempt = 0
            $maxAttempts = 30
            do {
                $attempt++
                try {
                    $response = Invoke-WebRequest -Uri $HealthCheckUrl -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
                    if ($response.StatusCode -eq 200) {
                        Write-Output "✅ $Name is ready!"
                        return $true
                    }
                }
                catch {
                    # Service not ready yet
                }
                Start-Sleep -Seconds 1
            } while ($attempt -lt $maxAttempts)
            
            Write-Output "❌ $Name failed to start"
            return $false
        }
        
        return $true
    } -ArgumentList $Name, $Path, $Command, $HealthCheckUrl
    
    return $job
}

# Start all services in parallel
Write-Host "Starting all services in parallel..." -ForegroundColor Cyan

$jobs = @()
$jobs += Start-ServiceBackground -Name "Main Server" -Path "D:\lsr-be" -Command "npm run start" -HealthCheckUrl "http://localhost:3002"
$jobs += Start-ServiceBackground -Name "Alarm Service" -Path "D:\lsr-be" -Command "npm run alarm-independent" -HealthCheckUrl "http://localhost:3001"
$jobs += Start-ServiceBackground -Name "Frontend" -Path "D:\MecObsr" -Command "npm run start" -HealthCheckUrl "http://localhost:3000"

# Wait for all services to be ready
Write-Host "Waiting for all services to be ready..." -ForegroundColor Cyan
$allReady = $false
$maxWaitTime = 60 # Maximum 60 seconds
$startTime = Get-Date

while (-not $allReady -and ((Get-Date) - $startTime).TotalSeconds -lt $maxWaitTime) {
    $allReady = $true
    foreach ($job in $jobs) {
        if ($job.State -eq "Running") {
            $allReady = $false
            break
        }
    }
    
    if (-not $allReady) {
        Start-Sleep -Seconds 1
    }
}

# Check results
$success = $true
foreach ($job in $jobs) {
    $result = Receive-Job -Job $job
    if ($result -contains "❌") {
        $success = $false
    }
    Write-Host $result
}

Remove-Job -Job $jobs

if (-not $success) {
    Write-Host "❌ Some services failed to start" -ForegroundColor Red
    exit 1
}

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
Write-Host "=========================================" -ForegroundColor Green
Write-Host "✅ All services started and ready!" -ForegroundColor Green
Write-Host "- Main Server: http://localhost:3002" -ForegroundColor Cyan
Write-Host "- Alarm Service: http://localhost:3001" -ForegroundColor Cyan
Write-Host "- Frontend: http://localhost:3000" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Press any key to exit..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
