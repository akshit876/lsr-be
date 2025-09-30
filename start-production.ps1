# Production startup script using PM2
Write-Host "Starting Laser System (Production Mode)..." -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green

# Check if PM2 is installed
try {
    $pm2Version = pm2 --version 2>$null
    if (-not $pm2Version) {
        throw "PM2 not found"
    }
    Write-Host "✅ PM2 found: $pm2Version" -ForegroundColor Green
}
catch {
    Write-Host "❌ PM2 is not installed. Please install PM2 first:" -ForegroundColor Red
    Write-Host "npm install -g pm2" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

# Navigate to project directory
Set-Location "D:\lsr-be"

# Stop any existing PM2 processes
Write-Host "🛑 Stopping existing processes..." -ForegroundColor Yellow
pm2 stop all 2>$null
pm2 delete all 2>$null

# Start all services using PM2
Write-Host "🚀 Starting all services in production mode..." -ForegroundColor Yellow
pm2 start ecosystem.config.js

# Wait for services to initialize
Write-Host "⏳ Waiting for services to initialize..." -ForegroundColor Cyan
Start-Sleep -Seconds 5

# Check service status
Write-Host "📊 Service Status:" -ForegroundColor Cyan
pm2 status

# Start the frontend
Write-Host "🌐 Starting Frontend..." -ForegroundColor Yellow
Set-Location "D:\MecObsr"
$frontendProcess = Start-Process -FilePath "cmd" -ArgumentList "/c", "npm run start" -PassThru -WindowStyle Minimized

# Wait for frontend to be ready
Write-Host "⏳ Waiting for frontend to initialize..." -ForegroundColor Cyan
Start-Sleep -Seconds 10

# Open Chrome
Write-Host "🌐 Opening Chrome..." -ForegroundColor Yellow
try {
    Start-Process "C:\Program Files\Google\Chrome\Application\chrome.exe" -ArgumentList "--incognito", "http://localhost:3000"
    Write-Host "✅ Chrome opened successfully" -ForegroundColor Green
}
catch {
    Write-Host "❌ Failed to open Chrome: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "✅ Production services started!" -ForegroundColor Green
Write-Host "- Main Server: http://localhost:3002" -ForegroundColor Cyan
Write-Host "- Alarm Service: http://localhost:3001" -ForegroundColor Cyan
Write-Host "- Frontend: http://localhost:3000" -ForegroundColor Cyan
Write-Host ""
Write-Host "📋 Management Commands:" -ForegroundColor Yellow
Write-Host "- pm2 status     (check status)" -ForegroundColor White
Write-Host "- pm2 logs       (view logs)" -ForegroundColor White
Write-Host "- pm2 restart all (restart all)" -ForegroundColor White
Write-Host "- pm2 stop all   (stop all)" -ForegroundColor White
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Press any key to exit..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
