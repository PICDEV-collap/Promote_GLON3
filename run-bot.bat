@echo off
chcp 65001 > nul
title N3 Bot Service - Quick Start
color 0A

echo ========================================================
echo        ระบบสั่งซื้อสลาก N3 อัตโนมัติ (N3 Bot Service)
echo ========================================================
echo กำลังเริ่มต้นระบบ...
echo.

cd /d "%~dp0bot-service"

if not exist node_modules (
    echo [INFO] ตรวจพบการรันครั้งแรก กำลังติดตั้ง Dependencies...
    call npm install
    call npx playwright install chromium
)

if not exist .env (
    echo [INFO] กำลังสร้างไฟล์ .env จาก .env.example...
    copy .env.example .env > nul
)

echo [INFO] คอมไพล์โปรเจกต์...
call npm run build

echo.
echo ========================================================
echo   เริ่มรันเซิร์ฟเวอร์ที่ Port 3333...
echo   กด Ctrl + C เพื่อหยุดการทำงาน
echo ========================================================
echo.
npm start

pause
