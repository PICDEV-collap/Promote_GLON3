@echo off
title N3 Dealer - Live Browser Login & Scanner
color 0B

echo ===================================================================
echo             OPENING LIVE BROWSER FOR N3 DEALER LOGIN
echo ===================================================================
echo.
echo Opening Chrome window on your screen...
echo.

cd /d "%~dp0bot-service"
call npx ts-node src/automation/open-live-browser.ts

pause
