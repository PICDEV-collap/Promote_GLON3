@echo off
title N3 Bot - Stop and Clean System
color 0C

echo ===================================================================
echo               STOPPING N3 BOT & CLEANING SYSTEM
echo ===================================================================
echo.
echo [1/3] Stopping Node.js Bot Services (Port 3333)...
powershell -Command "Get-NetTCPConnection -LocalPort 3333 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"

echo [2/3] Stopping Cloudflare Tunnel processes...
powershell -Command "Get-Process -Name *cloudflared* -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue"

echo [3/3] Cleaning temporary QR code files and logs...
if exist "%~dp0public\qrcodes\payment-*.png" del /q "%~dp0public\qrcodes\payment-*.png"
if exist "%~dp0public\qrcodes\error-*.png" del /q "%~dp0public\qrcodes\error-*.png"
if exist "%~dp0tunnel.log" del /q "%~dp0tunnel.log"
if exist "%~dp0bot.log" del /q "%~dp0bot.log"

echo.
echo ===================================================================
echo   [SUCCESS] N3 Bot has been completely STOPPED and CLEANED!
echo   Memory and Port 3333 are fully restored.
echo ===================================================================
echo.
pause
