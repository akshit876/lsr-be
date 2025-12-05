@echo off
REM ============================================================
REM Start Flask Service Only (For Testing)
REM ============================================================

set FLASK_DIR=D:\lsr-be\python\spinnaker_python-4.2.0.88-cp310-cp310-win_amd64\live_inspector
set VENV_PYTHON_ROOT=D:\lsr-be\python\venv\python.exe
set VENV_PYTHON_SCRIPTS=D:\lsr-be\python\venv\Scripts\python.exe

echo Starting Flask Live Inspector Service...
echo.

REM Check both possible locations (conda venv has python.exe in root, standard venv has it in Scripts)
if exist "%VENV_PYTHON_ROOT%" (
    echo Using venv Python: %VENV_PYTHON_ROOT%
    echo Working Directory: %FLASK_DIR%
    echo.
    cd /d "%FLASK_DIR%"
    "%VENV_PYTHON_ROOT%" flask_service.py
    goto :end
)

if exist "%VENV_PYTHON_SCRIPTS%" (
    echo Using venv Python: %VENV_PYTHON_SCRIPTS%
    echo Working Directory: %FLASK_DIR%
    echo.
    cd /d "%FLASK_DIR%"
    "%VENV_PYTHON_SCRIPTS%" flask_service.py
    goto :end
)

echo ERROR: Venv Python not found
echo.
echo Please check:
echo   1. Venv exists at: D:\lsr-be\python\venv
echo   2. Python executable exists at either:
echo      - %VENV_PYTHON_ROOT% (conda venv)
echo      - %VENV_PYTHON_SCRIPTS% (standard venv)
echo.
echo Trying system Python as fallback...
cd /d "%FLASK_DIR%"
python flask_service.py

:end

pause

