@echo off
echo Starting Development Mode (Alarm + UI Only)
echo ===========================================

REM Start Alarm Service
echo Starting Alarm Service...
cd /d "D:\lsr-be"
start "Alarm Service" cmd /k "npm run alarm-independent"

REM Wait 3 seconds
timeout /t 3 /nobreak >nul

REM Start Frontend
echo Starting Frontend...
cd /d "D:\MecObsr"
start "Frontend" cmd /k "npm run dev"

REM Wait 10 seconds
timeout /t 10 /nobreak >nul

REM Open Chrome
echo Opening Chrome...
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --incognito http://localhost:3000

echo.
echo Development environment started!
echo - Alarm Service: http://localhost:3001
echo - Frontend: http://localhost:3000
echo.
pause
