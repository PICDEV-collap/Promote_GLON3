@echo off
title Create N3 Bot Desktop Shortcuts - สร้างทางลัดบน Desktop
chcp 65001 >nul
cd /d "%~dp0"

echo ===================================================================
echo     สร้างทางลัด (Shortcuts) สำหรับบอทสลาก N3 บนหน้าจอ Desktop
echo ===================================================================
echo.
echo กำลังสร้างทางลัด...

cscript //nologo scripts\create-desktop-shortcuts.vbs

echo.
echo ===================================================================
echo     ✅ สร้างทางลัดบน Desktop สำเร็จเรียบร้อยแล้ว:
echo       1. 🚀 เปิดบอท N3 (ซ่อนหน้าต่าง).lnk
echo       2. 🛑 ปิดบอท N3 (STOP-BOT).lnk
echo       3. ⚙️ N3-MANAGER แผงควบคุม.lnk
echo ===================================================================
echo.
timeout /t 3 >nul 2>&1
