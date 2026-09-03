# PowerShell Start Script for N3 Bot Service
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "       ระบบสั่งซื้อสลาก N3 อัตโนมัติ (N3 Bot Service)       " -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan

Set-Location "$PSScriptRoot\bot-service"

if (-not (Test-Path "node_modules")) {
    Write-Host "[INFO] ติดตั้ง Dependencies ครั้งแรก..." -ForegroundColor Yellow
    npm install
    npx playwright install chromium
}

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
}

Write-Host "[INFO] เริ่มต้น Bot Service ที่พอร์ต 3333..." -ForegroundColor Green
npm start
