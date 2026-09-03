@echo off
title STOP N3 BOT SERVICE
chcp 65001 >nul

echo ===================================================================
echo     🛑 กำลังปิดการทำงานของระบบบอท N3 ในเบื้องหลัง...
echo ===================================================================
echo.

powershell -Command "Get-NetTCPConnection -LocalPort 3333 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"
powershell -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*browser_profile*' -or $_.CommandLine -like '*n3-bot-service*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"

echo [SUCCESS] ปิดระบบบอทและ Chrome เบื้องหลังเรียบร้อยแล้วครับ!
echo.
timeout /t 3
