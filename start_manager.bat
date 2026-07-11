@echo off
title TV SHOP Portal Manager Launcher

echo ===================================================
echo   Starting TV SHOP Portal Manager...
echo ===================================================

:: Check Python installation
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python not found! Please install Python and check "Add to PATH".
    pause
    exit /b
)

:: Install dependencies
echo [1/3] Checking dependencies (fastapi, uvicorn)...
python -m pip install fastapi uvicorn >nul 2>&1

:: Open web editor in browser
echo [2/3] Opening manager in web browser...
start http://127.0.0.1:8000

:: Start FastAPI server
echo [3/3] Starting FastAPI local server...
echo ---------------------------------------------------
python tvshop_manager/main.py

if %errorlevel% neq 0 (
    echo [ERROR] Server terminated with error.
    pause
)
