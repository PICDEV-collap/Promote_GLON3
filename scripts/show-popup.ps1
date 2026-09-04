# ===================================================================
#   show-popup.ps1 : แสดงหน้าต่างแจ้งเตือนสถานะบอทสลาก N3 (ภาษาไทย 100% ไร้ปัญหา Mojibake)
# ===================================================================
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$rootDir = Split-Path -Parent $PSScriptRoot
$urlFile = Join-Path $rootDir "webhook-url.txt"
$webhook = ""

if (Test-Path $urlFile) {
    try {
        $webhook = (Get-Content $urlFile -Raw -Encoding UTF8).Trim()
    } catch {}
}

$ws = New-Object -ComObject WScript.Shell
$title = "ระบบบอทรับออเดอร์สลาก N3 (โหมดเบื้องหลัง)"

$urlInfo = ""
if ($webhook) {
    $urlInfo = "• LINE Webhook: " + $webhook + "`r`n`r`n"
}

$msg = "🚀 บอทสลาก N3 ธนกิจนำโชค เริ่มทำงานในเบื้องหลังเรียบร้อยแล้ว!`r`n`r`n" +
       $urlInfo +
       "• หน้าต่างบอทและหน้าต่างเบราว์เซอร์ถูกซ่อนไว้ 100% ไม่เกะกะหน้าจอ`r`n" +
       "• บอทจะคอยรับออเดอร์ทาง LINE อัตโนมัติตลอด 24 ชม.`r`n" +
       "• ตรวจสอบสถานะ / โควต้า ได้ที่: N3-MANAGER.bat`r`n" +
       "• ปิดบอทเมื่อต้องการได้ที่: STOP-BOT.bat"

# แสดง Popup อัตโนมัติ (ปิดตัวเองใน 4 วินาที, Icon Information = 64)
$ws.Popup($msg, 4, $title, 64)
