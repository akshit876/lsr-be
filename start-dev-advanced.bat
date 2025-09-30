@echo off
title Development Environment Launcher
color 0A

echo.
echo ========================================
echo   LASER SYSTEM - DEVELOPMENT MODE
echo ========================================
echo.

REM Check if directories exist
echo Checking directories...
if not exist "D:\lsr-be" (
    echo ERROR: D:\lsr-be directory not found!
    pause
    exit /b 1
)

if not exist "D:\MecObsr" (
    echo ERROR: D:\MecObsr directory not found!
    pause
    exit /b 1
)

echo ✅ Directories found

REM Start Alarm Service
echo.
echo [1/3] Starting Alarm Service...
cd /d "D:\lsr-be"
start "🚨 Alarm Service" cmd /k "title Alarm Service && npm run alarm-independent"
echo ✅ Alarm Service started

REM Wait for Alarm Service
echo Waiting for Alarm Service to initialize...
timeout /t 5 /nobreak >nul

REM Start Frontend
echo.
echo [2/3] Starting Frontend UI...
cd /d "D:\MecObsr"
start "🌐 Frontend UI" cmd /k "title Frontend UI && npm run dev"
echo ✅ Frontend UI started

REM Wait for Frontend
echo Waiting for Frontend to initialize...
timeout /t 15 /nobreak >nul

REM Open Chrome
echo.
echo [3/3] Opening Chrome...
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --incognito http://localhost:3000
echo ✅ Chrome opened

echo.
echo ========================================
echo   DEVELOPMENT ENVIRONMENT READY!
echo ========================================
echo.
echo Services Running:
echo - 🚨 Alarm Service: http://localhost:3001
echo - 🌐 Frontend UI: http://localhost:3000
echo.
echo Console Windows:
echo - Alarm Service: Check for safety violations
echo - Frontend UI: Check for build status
echo.
echo Press any key to exit this launcher...
pause >nul
