# LSR Services Startup Script for Windows PowerShell
# This script starts both the main server and socket microservice

Write-Host "🚀 Starting LSR Services..." -ForegroundColor Green

# Function to check if a port is in use
function Test-Port {
    param([int]$Port)
    
    try {
        $connection = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
        if ($connection) {
            Write-Host "❌ Port $Port is already in use!" -ForegroundColor Red
            return $false
        }
        return $true
    }
    catch {
        return $true
    }
}

# Check if ports are available
Write-Host "🔍 Checking port availability..." -ForegroundColor Yellow
if (-not (Test-Port 3002)) {
    Write-Host "Please stop the service using port 3002 first" -ForegroundColor Red
    exit 1
}

if (-not (Test-Port 3003)) {
    Write-Host "Please stop the service using port 3003 first" -ForegroundColor Red
    exit 1
}

# Start main server in background
Write-Host "📡 Starting Main Server (Port 3002)..." -ForegroundColor Cyan
Set-Location "D:\stuffs\lsr-be"
Start-Process -FilePath "npm" -ArgumentList "start" -WindowStyle Minimized -PassThru | Out-Null

# Wait a bit for main server to start
Start-Sleep -Seconds 3

# Start socket microservice in background
Write-Host "🔌 Starting Socket Microservice (Port 3003)..." -ForegroundColor Cyan
Set-Location "D:\stuffs\lsr-be\socket-microservice"
Start-Process -FilePath "npm" -ArgumentList "start" -WindowStyle Minimized -PassThru | Out-Null

# Wait a bit for socket service to start
Start-Sleep -Seconds 3

Write-Host "✅ Both services started!" -ForegroundColor Green
Write-Host ""
Write-Host "🌐 Main Server: http://localhost:3002" -ForegroundColor White
Write-Host "🔌 Socket Service: http://localhost:3003" -ForegroundColor White
Write-Host "📊 MongoDB: mongodb://localhost:27017" -ForegroundColor White
Write-Host ""
Write-Host "📝 To view logs:" -ForegroundColor Yellow
Write-Host "   Get-Content logs\combined.log -Wait" -ForegroundColor Gray
Write-Host "   Get-Content socket-microservice\logs\socket-service.log -Wait" -ForegroundColor Gray
Write-Host ""
Write-Host "🔍 Health checks:" -ForegroundColor Yellow
Write-Host "   Invoke-WebRequest http://localhost:3002/health" -ForegroundColor Gray
Write-Host "   Invoke-WebRequest http://localhost:3003/health" -ForegroundColor Gray
Write-Host ""
Write-Host "🛑 To stop services, close the npm windows or use Task Manager" -ForegroundColor Red
Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
