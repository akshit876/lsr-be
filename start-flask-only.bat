@echo off
REM ============================================================
REM Start Flask Service Only (For Testing)
REM ============================================================

set FLASK_DIR=D:\lsr-be\python\spinnaker_python-4.2.0.88-cp310-cp310-win_amd64\live_inspector
set VENV_PYTHON=D:\lsr-be\python\venv\Scripts\python.exe

echo Starting Flask Live Inspector Service...
echo.

REM Check if venv Python exists
if exist "%VENV_PYTHON%" (
    echo Using venv Python: %VENV_PYTHON%
    echo Working Directory: %FLASK_DIR%
    echo.
    cd /d "%FLASK_DIR%"
    "%VENV_PYTHON%" flask_service.py
) else (
    echo ERROR: Venv Python not found at %VENV_PYTHON%
    echo.
    echo Please check:
    echo   1. Venv exists at: D:\lsr-be\python\venv
    echo   2. Python executable exists at: %VENV_PYTHON%
    echo.
    echo Trying system Python as fallback...
    cd /d "%FLASK_DIR%"
    python flask_service.py
)

pause

