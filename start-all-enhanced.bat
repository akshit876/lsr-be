@echo off
echo Starting Laser System...
echo ========================

REM Start the Node.js server in silent mode
echo Starting Main Server...
cd /d "D:\lsr-be"
powershell -WindowStyle Hidden -Command "Start-Process cmd -ArgumentList '/c npm run start' -NoNewWindow"

REM Wait for Node.js server to initialize
echo Waiting for Main Server to initialize...
timeout /t 10 /nobreak >nul

REM Start the Independent Alarm Service in silent mode
echo Starting Alarm Service...
cd /d "D:\lsr-be"
powershell -WindowStyle Hidden -Command "Start-Process cmd -ArgumentList '/c npm run alarm-independent' -NoNewWindow"

REM Wait for Alarm Service to initialize
echo Waiting for Alarm Service to initialize...
timeout /t 5 /nobreak >nul

REM Start the Next.js app in silent mode
echo Starting Frontend...
cd /d "D:\MecObsr"
powershell -WindowStyle Hidden -Command "Start-Process cmd -ArgumentList '/c npm run start' -NoNewWindow"

REM Wait for Next.js app to initialize
echo Waiting for Frontend to initialize...
timeout /t 25 /nobreak >nul

REM Open Chrome in incognito mode at localhost:3000
echo Opening Chrome...
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --incognito http://localhost:3000

echo.
echo ========================
echo All services started!
echo - Main Server: http://localhost:3002
echo - Alarm Service: http://localhost:3001
echo - Frontend: http://localhost:3000
echo ========================
echo.
echo Press any key to exit...
pause >nul
