@echo off
echo Starting Laser System (Optimized)...
echo =====================================


REM Start Main Server
echo Starting Main Server...
cd /d "D:\lsr-be"
start /min "" cmd /c "npm run start"

REM Start Alarm Service
echo Starting Alarm Service...
cd /d "D:\lsr-be"
start /min "" cmd /c "npm run alarm-independent"

REM Start Frontend
echo Starting Frontend...
cd /d "D:\MecObsr"
start /min "" cmd /c "npm run start"

REM Open Chrome immediately without waiting
echo Opening Chrome...
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --incognito http://localhost:3000

echo.
echo =====================================
echo All services started and ready!
echo - Main Server: http://localhost:3002
echo - Alarm Service: http://localhost:3001
echo - Frontend: http://localhost:3000
echo =====================================
echo.
echo Press any key to exit...
pause >nul
