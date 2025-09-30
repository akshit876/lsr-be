@echo off
echo Starting Development Environment...
echo ====================================

REM Start the Independent Alarm Service
echo Starting Alarm Service...
cd /d "D:\lsr-be"
start "Alarm Service" cmd /k "npm run alarm-independent"

REM Wait for Alarm Service to initialize
echo Waiting for Alarm Service to initialize...
timeout /t 3 /nobreak >nul

REM Start the Next.js UI
echo Starting Frontend...
cd /d "D:\MecObsr"
start "Frontend UI" cmd /k "npm run dev"

REM Wait for Frontend to initialize
echo Waiting for Frontend to initialize...
timeout /t 10 /nobreak >nul

REM Open Chrome in development mode
echo Opening Chrome...
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --incognito http://localhost:3000

echo.
echo ====================================
echo Development Environment Started!
echo - Alarm Service: http://localhost:3001
echo - Frontend UI: http://localhost:3000
echo ====================================
echo.
echo Press any key to exit...
pause >nul
