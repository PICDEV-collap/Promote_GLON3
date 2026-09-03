@echo off
title N3 Bot Service - Quick Start
color 0A

echo ========================================================
echo                 N3 BOT SERVICE - QUICK START
echo ========================================================
echo Starting service...
echo.

cd /d "%~dp0bot-service"

if not exist node_modules (
    echo [INFO] Installing dependencies...
    call npm install
    call npx playwright install chromium
)

if not exist .env (
    echo [INFO] Creating .env from .env.example...
    copy .env.example .env > nul
)

echo [INFO] Building TypeScript project...
call npm run build

echo.
echo ========================================================
echo   Running N3 Bot Service on Port 3333...
echo   Press Ctrl + C to stop
echo ========================================================
echo.
npm start

pause
