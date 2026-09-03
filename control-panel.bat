@echo off
chcp 65001 > nul
title N3 Bot Service - Control Panel
color 0B

:MENU
cls
echo ===================================================================
echo             แผงควบคุมระบบสลาก N3 อัตโนมัติ (Control Panel)
echo ===================================================================
echo.
echo   [1] เริ่มรันระบบบอทหลัก (Start Bot Service - Port 3333)
echo   [2] ทดสอบดึง QR Code ล็อกอินเป๋าตัง (Test Paotang Login)
echo   [3] ตรวจสอบและจัดการโควต้า 2,000 ใบ (Check & Reset Quota)
echo   [4] รันโหมดพัฒนา (Development Mode - Hot Reload)
echo   [5] เปิดโฟลเดอร์รูปภาพ QR Code (Open QR Folder)
echo   [0] ออกจากโปรแกรม (Exit)
echo.
echo ===================================================================
set /p choice="กรุณาเลือกเมนู [0-5]: "

if "%choice%"=="1" goto START_BOT
if "%choice%"=="2" goto TEST_LOGIN
if "%choice%"=="3" goto TEST_QUOTA
if "%choice%"=="4" goto DEV_MODE
if "%choice%"=="5" goto OPEN_QR
if "%choice%"=="0" exit
goto MENU

:START_BOT
cls
echo ===================================================================
echo [1] เริ่มรันระบบบอทหลัก...
echo ===================================================================
cd /d "%~dp0bot-service"
call npm start
pause
goto MENU

:TEST_LOGIN
cls
echo ===================================================================
echo [2] ทดสอบเปิดหน้าเว็บ N3 และดึง QR Code ล็อกอินเป๋าตัง...
echo ===================================================================
cd /d "%~dp0bot-service"
call npx ts-node src/automation/test-click-paotang.ts
echo.
echo รูป QR Code ถูกบันทึกไว้ในโฟลเดอร์ public/qrcodes/
pause
goto MENU

:TEST_QUOTA
cls
echo ===================================================================
echo [3] ตรวจสอบและทดสอบระบบจัดการโควต้า 2,000 ใบ...
echo ===================================================================
cd /d "%~dp0bot-service"
call npx ts-node src/quota/test-quota.ts
pause
goto MENU

:DEV_MODE
cls
echo ===================================================================
echo [4] รันโหมดพัฒนา (Development Mode)...
echo ===================================================================
cd /d "%~dp0bot-service"
call npm run dev
pause
goto MENU

:OPEN_QR
start "" "%~dp0public\qrcodes"
goto MENU
