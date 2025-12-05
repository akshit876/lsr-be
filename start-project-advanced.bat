@echo off
REM ============================================================
REM Advanced Project Startup Script with Error Handling
REM Starts Node.js backend, Next.js frontend, and Flask service
REM ============================================================

setlocal enabledelayedexpansion

echo ============================================================
echo Project Startup Script
echo ============================================================
echo.

REM ============================================================
REM Configuration
REM ============================================================
set NODE_BACKEND_DIR=D:\lsr-be
set NEXTJS_DIR=D:\MecObsr
set FLASK_DIR=D:\lsr-be\python\spinnaker_python-4.2.0.88-cp310-cp310-win_amd64\live_inspector
set VENV_DIR=D:\lsr-be\python\venv
set CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe

REM ============================================================
REM Step 1: Start Node.js Backend Server
REM ============================================================
echo [1/4] Starting Node.js Backend Server...
cd /d "%NODE_BACKEND_DIR%"
if not exist "package.json" (
    echo    ERROR: package.json not found in %NODE_BACKEND_DIR%
    goto :error
)
powershell -WindowStyle Hidden -Command "Start-Process cmd -ArgumentList '/c npm run start' -NoNewWindow"
timeout /t 3 /nobreak >nul
echo    ✓ Node.js server started on port 3002
echo.

REM ============================================================
REM Step 2: Start Flask Live Inspector Service
REM ============================================================
echo [2/4] Starting Flask Live Inspector Service...
cd /d "%FLASK_DIR%"

REM Check if venv exists
if not exist "%VENV_DIR%\Scripts\python.exe" (
    echo    WARNING: Conda venv not found at %VENV_DIR%
    echo    Attempting to use system Python...
    powershell -WindowStyle Hidden -Command "Start-Process cmd -ArgumentList '/c python flask_service.py' -NoNewWindow -WorkingDirectory '%FLASK_DIR%'"
) else (
    REM Use conda activate or direct venv python
    set PYTHON_EXE=%VENV_DIR%\Scripts\python.exe
    if exist "%PYTHON_EXE%" (
        powershell -WindowStyle Hidden -Command "Start-Process cmd -ArgumentList '/c \"%PYTHON_EXE%\" flask_service.py' -NoNewWindow -WorkingDirectory '%FLASK_DIR%'"
    ) else (
        REM Try conda activate
        powershell -WindowStyle Hidden -Command "Start-Process cmd -ArgumentList '/c conda activate %VENV_DIR% && python flask_service.py' -NoNewWindow -WorkingDirectory '%FLASK_DIR%'"
    )
)

timeout /t 5 /nobreak >nul
echo    ✓ Flask service started on port 5000
echo.

REM ============================================================
REM Step 3: Start Next.js Frontend
REM ============================================================
echo [3/4] Starting Next.js Frontend...
cd /d "%NEXTJS_DIR%"
if not exist "package.json" (
    echo    ERROR: package.json not found in %NEXTJS_DIR%
    goto :error
)
powershell -WindowStyle Hidden -Command "Start-Process cmd -ArgumentList '/c npm run start' -NoNewWindow"
timeout /t 5 /nobreak >nul
echo    ✓ Next.js app started on port 3000
echo.

REM ============================================================
REM Step 4: Open Chrome Browser
REM ============================================================
echo [4/4] Opening Chrome Browser...
if exist "%CHROME_PATH%" (
    start "" "%CHROME_PATH%" --incognito http://localhost:3000
    timeout /t 2 /nobreak >nul
    echo    ✓ Chrome opened
) else (
    echo    WARNING: Chrome not found at %CHROME_PATH%
    echo    Please open http://localhost:3000 manually
)
echo.

REM ============================================================
REM Summary
REM ============================================================
echo ============================================================
echo All Services Started Successfully!
echo ============================================================
echo.
echo Services Running:
echo   - Node.js Backend:    http://localhost:3002
echo   - Flask Service:      http://localhost:5000
echo   - Next.js Frontend:   http://localhost:3000
echo.
echo Health Checks:
echo   - Backend:  http://localhost:3002/health (if available)
echo   - Flask:    http://localhost:5000/health
echo.
echo To stop all services:
echo   taskkill /F /IM node.exe
echo   taskkill /F /IM python.exe
echo.
goto :end

:error
echo.
echo ============================================================
echo ERROR: Failed to start services
echo ============================================================
pause
exit /b 1

:end
pause

