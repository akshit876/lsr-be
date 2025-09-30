@echo off

REM Start the Node.js server in silent mode
cd /d "D:\lsr-be"
powershell -WindowStyle Hidden -Command "Start-Process cmd -ArgumentList '/c npm run start' -NoNewWindow"

REM Wait for Node.js server to initialize
timeout /t 10 /nobreak >nul

REM Start the Independent Alarm Service in silent mode
cd /d "D:\lsr-be"
powershell -WindowStyle Hidden -Command "Start-Process cmd -ArgumentList '/c npm run alarm-independent' -NoNewWindow"

REM Wait for Alarm Service to initialize
timeout /t 5 /nobreak >nul

REM Start the Next.js app in silent mode
cd /d "D:\MecObsr"
powershell -WindowStyle Hidden -Command "Start-Process cmd -ArgumentList '/c npm run start' -NoNewWindow"

REM Wait for Next.js app to initialize
timeout /t 25 /nobreak >nul

REM Open Chrome in incognito mode at localhost:3000
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --incognito http://localhost:3000

pause
