' ===================================================================
'   START-BOT-HIDDEN.vbs : ตัวเปิดบอทสลาก N3 แบบซ่อนหน้าต่าง 100%
'   ร้านสลาก N3 ธนกิจนำโชค
' ===================================================================

Set FSO = CreateObject("Scripting.FileSystemObject")
Set WshShell = CreateObject("WScript.Shell")

' โฟลเดอร์ที่ตั้งของโปรเจกต์
strScriptDir = FSO.GetParentFolderName(WScript.ScriptFullName)

' รันสคริปต์ n3-engine.js โหมด bg แบบซ่อนหน้าต่าง CMD (Window Style = 0: Hide, WaitOnReturn = False)
strCommand = "cmd.exe /c cd /d """ & strScriptDir & """ && node scripts\n3-engine.js bg"
WshShell.Run strCommand, 0, False

' แสดงกล่องข้อความแจ้งเตือนอัตโนมัติ (จะปิดตัวเองใน 3 วินาที ไม่ต้องคอยกดปิด)
strMsg = "🚀 บอทสลาก N3 ธนกิจนำโชค เริ่มทำงานในเบื้องหลังเรียบร้อยแล้ว!" & vbCrLf & vbCrLf & _
         "• หน้าต่างบอทและหน้าต่างเบราว์เซอร์ถูกซ่อนไว้ 100% ไม่เกะกะหน้าจอ" & vbCrLf & _
         "• บอทจะคอยรับออเดอร์ทาง LINE อัตโนมัติตลอด 24 ชม." & vbCrLf & _
         "• ตรวจสอบสถานะ / โควต้า ได้ที่: N3-MANAGER.bat" & vbCrLf & _
         "• ปิดบอทเมื่อต้องการได้ที่: STOP-BOT.bat"

WshShell.Popup strMsg, 3, "ระบบบอทรับออเดอร์สลาก N3 (โหมดเบื้องหลัง)", 64
