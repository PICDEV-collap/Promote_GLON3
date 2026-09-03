@echo off
title N3-MANAGER : N3 Lottery Bot and Agent Control Center
cd /d "%~dp0"
node scripts\n3-engine.js menu
if %errorlevel% neq 0 pause
