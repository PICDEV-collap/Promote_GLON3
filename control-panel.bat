@echo off
title N3 Bot Service - Control Panel
color 0B

:MENU
cls
echo ===================================================================
echo                   N3 BOT SERVICE - CONTROL PANEL
echo ===================================================================
echo.
echo   [1] Start Bot Service (Port 3333)
echo   [2] Test Paotang QR Login (Generate Login QR for Paotang Scan)
echo   [3] Check and Test Quota Manager (2,000 Tickets)
echo   [4] Run Development Mode (Hot Reload)
echo   [5] Open QR Codes Image Folder
echo   [6] Open LINE Webhook Public Tunnel (HTTPS)
echo   [7] Open Live Chrome Browser (???????????? Chrome ??????????????????????)
echo   [0] Exit
echo.
echo ===================================================================
set /p choice="Please select an option [0-7]: "

if "%choice%"=="1" goto START_BOT
if "%choice%"=="2" goto TEST_LOGIN
if "%choice%"=="3" goto TEST_QUOTA
if "%choice%"=="4" goto DEV_MODE
if "%choice%"=="5" goto OPEN_QR
if "%choice%"=="6" goto START_TUNNEL
if "%choice%"=="7" goto LIVE_CHROME
if "%choice%"=="0" exit
goto MENU

:START_BOT
cls
echo ===================================================================
echo [1] Starting N3 Bot Service...
echo ===================================================================
cd /d "%~dp0bot-service"
call npm start
pause
goto MENU

:TEST_LOGIN
cls
echo ===================================================================
echo [2] Generating Paotang QR Code for Login...
echo ===================================================================
cd /d "%~dp0bot-service"
call npx ts-node src/automation/test-click-paotang.ts
pause
goto MENU

:TEST_QUOTA
cls
echo ===================================================================
echo [3] Testing Quota Manager (2,000 Tickets)...
echo ===================================================================
cd /d "%~dp0bot-service"
call npx ts-node src/quota/test-quota.ts
pause
goto MENU

:DEV_MODE
cls
echo ===================================================================
echo [4] Running in Development Mode...
echo ===================================================================
cd /d "%~dp0bot-service"
call npm run dev
pause
goto MENU

:OPEN_QR
start "" "%~dp0public\qrcodes"
goto MENU

:START_TUNNEL
cls
call "%~dp0tunnel.bat"
goto MENU

:LIVE_CHROME
cls
call "%~dp0open-live-login.bat"
goto MENU
