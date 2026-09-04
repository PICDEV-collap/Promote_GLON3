# ===================================================================
#   create-desktop-shortcuts.ps1 : สร้างทางลัดบน Desktop สำหรับบอท N3
#   รองรับภาษาไทย 100% ไร้ปัญหา Mojibake
# ===================================================================
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$WshShell = New-Object -ComObject WScript.Shell
$DesktopPath = [Environment]::GetFolderPath("Desktop")

# หาโฟลเดอร์ Root ของโปรเจกต์
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$RootDir = Split-Path -Parent $ScriptDir

# 1. ทางลัด: เปิดบอทแบบซ่อนหน้าต่าง
$sc1Path = Join-Path $DesktopPath "START-N3-BOT-SILENT.lnk"
$sc1 = $WshShell.CreateShortcut($sc1Path)
$sc1.TargetPath = "wscript.exe"
$sc1.Arguments = "`"$RootDir\START-BOT-HIDDEN.vbs`""
$sc1.WorkingDirectory = $RootDir
$sc1.Description = "เปิดบอทรับออเดอร์สลาก N3 ในเบื้องหลัง (ซ่อนหน้าต่าง 100%)"
$sc1.IconLocation = "shell32.dll,137"
$sc1.Save()

# 2. ทางลัด: ปิดบอท
$sc2Path = Join-Path $DesktopPath "STOP-N3-BOT.lnk"
$sc2 = $WshShell.CreateShortcut($sc2Path)
$sc2.TargetPath = Join-Path $RootDir "STOP-BOT.bat"
$sc2.WorkingDirectory = $RootDir
$sc2.Description = "หยุดการทำงานของบอทสลาก N3 และคืนพอร์ต 3333"
$sc2.IconLocation = "shell32.dll,27"
$sc2.Save()

# 3. ทางลัด: แผงควบคุม N3-MANAGER
$sc3Path = Join-Path $DesktopPath "N3-MANAGER.lnk"
$sc3 = $WshShell.CreateShortcut($sc3Path)
$sc3.TargetPath = Join-Path $RootDir "N3-MANAGER.bat"
$sc3.WorkingDirectory = $RootDir
$sc3.Description = "แผงควบคุมระบบบอท ตรวจเช็คโควต้า และตั้งค่าระบบสลาก N3"
$sc3.IconLocation = "shell32.dll,21"
$sc3.Save()

# 4. ทางลัด: เปิดบอทแบบโชว์หน้าต่างดำ (สำหรับดู Log สด)
$sc4Path = Join-Path $DesktopPath "START-N3-BOT.lnk"
$sc4 = $WshShell.CreateShortcut($sc4Path)
$sc4.TargetPath = Join-Path $RootDir "START-BOT.bat"
$sc4.WorkingDirectory = $RootDir
$sc4.Description = "เปิดบอทสลาก N3 แบบแสดงหน้าจอ CMD (สำหรับตรวจสอบการทำงานสด)"
$sc4.IconLocation = "shell32.dll,44"
$sc4.Save()

# 5. ทางลัด: อัปเดตและรีสตาร์ทบอท (ไม่เปลี่ยน Webhook URL)
$sc5Path = Join-Path $DesktopPath "UPDATE-N3-BOT.lnk"
$sc5 = $WshShell.CreateShortcut($sc5Path)
$sc5.TargetPath = Join-Path $RootDir "UPDATE-BOT.bat"
$sc5.WorkingDirectory = $RootDir
$sc5.Description = "อัปเดตโค้ดล่าสุดและรีสตาร์ทบอทสลาก N3 โดยคง Webhook URL เดิม 100%"
$sc5.IconLocation = "shell32.dll,238"
$sc5.Save()

Write-Host "✅ Shortcuts created on Desktop: $DesktopPath"