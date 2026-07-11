@echo off
title TV SHOP Portal Manager Launcher
chcp 65001 > nul

echo ===================================================
echo   Запуск TV SHOP Portal Manager...
echo ===================================================

:: Проверка наличия Python в системе
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ОШИБКА] Python не установлен или не добавлен в переменные среды (PATH)!
    echo Установите Python с официального сайта и отметьте галочку "Add Python to PATH".
    pause
    exit /b
)

:: Установка необходимых зависимостей
echo [1/3] Проверка и автоустановка зависимостей (fastapi, uvicorn)...
python -m pip install fastapi uvicorn >nul 2>&1

:: Автоматический запуск панели в браузере через 2 секунды
echo [2/3] Открытие панели управления в браузере...
timeout /t 2 /nobreak >nul
start http://127.0.0.1:8000

:: Старт сервера
echo [3/3] Запуск веб-сервера FastAPI...
echo ---------------------------------------------------
python tvshop_manager/main.py

if %errorlevel% neq 0 (
    echo [ОШИБКА] Произошел сбой при работе веб-сервера.
    pause
)
