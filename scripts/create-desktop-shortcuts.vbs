' ===================================================================
'   create-desktop-shortcuts.vbs : สร้างทางลัดบน Desktop สำหรับบอท N3
' ===================================================================

Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")

strDesktop = WshShell.SpecialFolders("Desktop")
' หา path ของโฟลเดอร์ Promote_GLON3
strScriptPath = WScript.ScriptFullName
strScriptsDir = FSO.GetParentFolderName(strScriptPath)
strRootDir = FSO.GetParentFolderName(strScriptsDir)

' รันผ่าน PowerShell create-desktop-shortcuts.ps1 เพื่อภาษาไทยคมชัด 100% ไร้ปัญหา Mojibake
strPs1Path = strScriptsDir & "\create-desktop-shortcuts.ps1"
If FSO.FileExists(strPs1Path) Then
    WshShell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & strPs1Path & """", 0, True
    WScript.Quit 0
End If

' 1. ทางลัด: เปิดบอทแบบซ่อนหน้าต่าง
Set sc1 = WshShell.CreateShortcut(strDesktop & "\START-N3-BOT-SILENT.lnk")
sc1.TargetPath = "wscript.exe"
sc1.Arguments = """" & strRootDir & "\START-BOT-HIDDEN.vbs"""
sc1.WorkingDirectory = strRootDir
sc1.Description = "เปิดบอทรับออเดอร์สลาก N3 ในเบื้องหลัง (ซ่อนหน้าต่าง 100% ไม่กวนหน้าจอ)"
sc1.IconLocation = "shell32.dll,137"
sc1.Save

' 2. ทางลัด: ปิดบอท
Set sc2 = WshShell.CreateShortcut(strDesktop & "\STOP-N3-BOT.lnk")
sc2.TargetPath = strRootDir & "\STOP-BOT.bat"
sc2.WorkingDirectory = strRootDir
sc2.Description = "หยุดการทำงานของบอทสลาก N3 และคืนพอร์ต 3333"
sc2.IconLocation = "shell32.dll,27"
sc2.Save

' 3. ทางลัด: แผงควบคุม N3-MANAGER
Set sc3 = WshShell.CreateShortcut(strDesktop & "\N3-MANAGER.lnk")
sc3.TargetPath = strRootDir & "\N3-MANAGER.bat"
sc3.WorkingDirectory = strRootDir
sc3.Description = "แผงควบคุมระบบบอท ตรวจเช็คโควต้า และตั้งค่าระบบสลาก N3"
sc3.IconLocation = "shell32.dll,21"
sc3.Save

' 4. ทางลัด: เปิดบอทแบบโชว์หน้าต่างดำ (สำหรับดู Log สด)
Set sc4 = WshShell.CreateShortcut(strDesktop & "\START-N3-BOT.lnk")
sc4.TargetPath = strRootDir & "\START-BOT.bat"
sc4.WorkingDirectory = strRootDir
sc4.Description = "เปิดบอทสลาก N3 แบบแสดงหน้าจอ CMD (สำหรับตรวจสอบการทำงานสด)"
sc4.IconLocation = "shell32.dll,44"
sc4.Save

WScript.Echo "Shortcuts created on Desktop: " & strDesktop
