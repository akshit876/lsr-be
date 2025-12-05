@echo off
REM ============================================================
REM Project Startup Script
REM Starts Node.js backend, Next.js frontend, and Flask service
REM ============================================================

echo Starting Project Services...
echo.

REM ============================================================
REM Step 1: Start Node.js Backend Server
REM ============================================================
echo [1/4] Starting Node.js Backend Server...
cd /d "D:\lsr-be"
powershell -WindowStyle Hidden -Command "Start-Process cmd -ArgumentList '/c npm run start' -NoNewWindow"
timeout /t 3 /nobreak >nul
echo    Node.js server started
echo.

REM ============================================================
REM Step 2: Start Flask Live Inspector Service
REM ============================================================
echo [2/4] Starting Flask Live Inspector Service...
set FLASK_DIR=D:\lsr-be\python\spinnaker_python-4.2.0.88-cp310-cp310-win_amd64\live_inspector
set VENV_PYTHON=D:\lsr-be\python\venv\Scripts\python.exe

REM Use direct Python executable from venv (no conda needed)
if exist "%VENV_PYTHON%" (
    powershell -WindowStyle Hidden -Command "Start-Process cmd -ArgumentList '/c \"%VENV_PYTHON%\" flask_service.py' -NoNewWindow -WorkingDirectory '%FLASK_DIR%'"
) else (
    echo    WARNING: Venv Python not found at %VENV_PYTHON%
    echo    Trying system Python...
    powershell -WindowStyle Hidden -Command "Start-Process cmd -ArgumentList '/c python flask_service.py' -NoNewWindow -WorkingDirectory '%FLASK_DIR%'"
)

timeout /t 5 /nobreak >nul
echo    Flask service started on port 5000
echo.

REM ============================================================
REM Step 3: Start Next.js Frontend
REM ============================================================
echo [3/4] Starting Next.js Frontend...
cd /d "D:\MecObsr"
powershell -WindowStyle Hidden -Command "Start-Process cmd -ArgumentList '/c npm run start' -NoNewWindow"
timeout /t 5 /nobreak >nul
echo    Next.js app started
echo.

REM ============================================================
REM Step 4: Open Chrome Browser
REM ============================================================
echo [4/4] Opening Chrome Browser...
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --incognito http://localhost:3000
timeout /t 2 /nobreak >nul
echo    Chrome opened
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
echo To stop services, close the command windows or use:
echo   taskkill /F /IM node.exe
echo   taskkill /F /IM python.exe
echo.
pause

