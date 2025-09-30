@echo off
echo Starting Laser System (Optimized)...
echo =====================================

REM Function to check if a service is ready
:check_service
set url=%1
set max_attempts=30
set attempt=0

:check_loop
set /a attempt+=1
if %attempt% gtr %max_attempts% (
    echo ERROR: Service at %url% not ready after %max_attempts% attempts
    exit /b 1
)

powershell -Command "try { $response = Invoke-WebRequest -Uri '%url%' -TimeoutSec 2 -UseBasicParsing; if ($response.StatusCode -eq 200) { exit 0 } } catch { exit 1 }" >nul 2>&1
if %errorlevel% equ 0 (
    echo Service at %url% is ready!
    exit /b 0
)

echo Waiting for service at %url%... (attempt %attempt%/%max_attempts%)
timeout /t 1 /nobreak >nul
goto check_loop

REM Start Main Server
echo Starting Main Server...
cd /d "D:\lsr-be"
start /min "" cmd /c "npm run start"

REM Wait for Main Server to be ready
call :check_service "http://localhost:3002"
if %errorlevel% neq 0 exit /b 1

REM Start Alarm Service
echo Starting Alarm Service...
cd /d "D:\lsr-be"
start /min "" cmd /c "npm run alarm-independent"

REM Wait for Alarm Service to be ready
call :check_service "http://localhost:3001"
if %errorlevel% neq 0 exit /b 1

REM Start Frontend
echo Starting Frontend...
cd /d "D:\MecObsr"
start /min "" cmd /c "npm run start"

REM Wait for Frontend to be ready
call :check_service "http://localhost:3000"
if %errorlevel% neq 0 exit /b 1

REM Open Chrome immediately after all services are ready
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
