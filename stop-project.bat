@echo off
REM ============================================================
REM Stop All Project Services
REM ============================================================

echo Stopping all project services...
echo.

echo Stopping Node.js processes...
taskkill /F /IM node.exe >nul 2>&1
if %errorlevel% == 0 (
    echo    ✓ Node.js processes stopped
) else (
    echo    No Node.js processes found
)

echo.
echo Stopping Python/Flask processes...
taskkill /F /IM python.exe >nul 2>&1
if %errorlevel% == 0 (
    echo    ✓ Python/Flask processes stopped
) else (
    echo    No Python processes found
)

echo.
echo ============================================================
echo All services stopped
echo ============================================================
echo.
pause

