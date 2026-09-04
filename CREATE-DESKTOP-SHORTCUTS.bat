@echo off
title Create N3 Bot Desktop Shortcuts
chcp 65001 >nul
cd /d "%~dp0"

echo ===================================================================
echo     Create Desktop Shortcuts for N3 Lottery Bot
echo ===================================================================
echo.
echo Creating shortcuts...

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\create-desktop-shortcuts.ps1"

echo.
echo ===================================================================
echo     Shortcuts created on Desktop successfully:
echo       1. START-N3-BOT-SILENT.lnk
echo       2. STOP-N3-BOT.lnk
echo       3. N3-MANAGER.lnk
echo       4. START-N3-BOT.lnk
echo ===================================================================
echo.
timeout /t 3 >nul 2>&1
