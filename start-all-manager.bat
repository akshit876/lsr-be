@echo off

REM Start both services using process manager
cd /d "D:\lsr-be"
powershell -WindowStyle Hidden -Command "Start-Process cmd -ArgumentList '/c npm run start-all' -NoNewWindow"

REM Wait for services to initialize
timeout /t 15 /nobreak >nul

REM Start the Next.js app in silent mode
cd /d "D:\MecObsr"
powershell -WindowStyle Hidden -Command "Start-Process cmd -ArgumentList '/c npm run start' -NoNewWindow"

REM Wait for Next.js app to initialize
timeout /t 25 /nobreak >nul

REM Open Chrome in incognito mode at localhost:3000
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --incognito http://localhost:3000

pause
