@echo off
title N3 BOT SERVICE - ร้านสลาก N3 ธนกิจนำโชค
chcp 65001 >nul
cd /d "%~dp0"

echo ===================================================================
echo     🚀 ร้านสลาก N3 ธนกิจนำโชค - ระบบบอทรับออเดอร์อัตโนมัติ 24 ชม.
echo ===================================================================
echo.
echo กำลังเริ่มต้นระบบบอทและ Cloudflare Tunnel...
echo.

node scripts\n3-engine.js start

if %errorlevel% neq 0 (
    echo.
    echo ⚠️ บอทหยุดทำงาน กรุณากดปุ่มใดๆ เพื่อปิดหน้าต่างนี้...
    pause >nul
)
