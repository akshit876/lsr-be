@echo off
echo Starting Laser System (Production Mode)...
echo ==========================================

REM Navigate to the project directory
cd /d "D:\lsr-be"

REM Start all backend services using process-manager.js in background
echo Starting backend services...
start /min "" cmd /c "npm run start-all"

REM Wait for backend services to initialize
echo Waiting for backend services to initialize...
timeout /t 8 /nobreak >nul

REM Start the frontend in background
echo Starting Frontend...
cd /d "D:\MecObsr"
start /min "" cmd /c "npm run start"

REM Wait for frontend to initialize
echo Waiting for frontend to initialize...
timeout /t 15 /nobreak >nul

REM Open Chrome
echo Opening Chrome...
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --incognito http://localhost:3000

echo.
echo ==========================================
echo Production services started in background!
echo - Main Server: http://localhost:3002
echo - Alarm Service: http://localhost:3001
echo - Frontend: http://localhost:3000
echo.
echo All services are running in minimized windows.
echo To stop services, close the minimized windows.
echo ==========================================
echo.
echo Press any key to exit...
pause >nul