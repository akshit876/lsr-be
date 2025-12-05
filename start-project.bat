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
set VENV_PYTHON_ROOT=D:\lsr-be\python\venv\python.exe
set VENV_PYTHON_SCRIPTS=D:\lsr-be\python\venv\Scripts\python.exe

REM Check both possible locations (conda venv has python.exe in root, standard venv has it in Scripts)
if exist "%VENV_PYTHON_ROOT%" (
    set VENV_PYTHON=%VENV_PYTHON_ROOT%
    goto :start_flask
)
if exist "%VENV_PYTHON_SCRIPTS%" (
    set VENV_PYTHON=%VENV_PYTHON_SCRIPTS%
    goto :start_flask
)

REM If neither found, try system Python
echo    WARNING: Venv Python not found
echo    Trying system Python...
powershell -WindowStyle Hidden -Command "Start-Process cmd -ArgumentList '/c python flask_service.py' -NoNewWindow -WorkingDirectory '%FLASK_DIR%'"
goto :flask_done

:start_flask
powershell -WindowStyle Hidden -Command "Start-Process cmd -ArgumentList '/c \"%VENV_PYTHON%\" flask_service.py' -NoNewWindow -WorkingDirectory '%FLASK_DIR%'"

:flask_done

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

