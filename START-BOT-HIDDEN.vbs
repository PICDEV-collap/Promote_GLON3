' ===================================================================
'   START-BOT-HIDDEN.vbs : ตัวเปิดบอทสลาก N3 แบบซ่อนหน้าต่าง 100%
'   ร้านสลาก N3 ธนกิจนำโชค
' ===================================================================

Set FSO = CreateObject("Scripting.FileSystemObject")
Set WshShell = CreateObject("WScript.Shell")

' โฟลเดอร์ที่ตั้งของโปรเจกต์
strScriptDir = FSO.GetParentFolderName(WScript.ScriptFullName)

' 1. รันสคริปต์ n3-engine.js โหมด bg ซ่อนหน้าต่าง CMD (WindowStyle = 0: Hide, WaitOnReturn = True เพื่อรอให้ Tunnel เชื่อมต่อเสร็จ)
strCommand = "cmd.exe /c cd /d """ & strScriptDir & """ && node scripts\n3-engine.js bg"
WshShell.Run strCommand, 0, True

' 2. แสดง Popup แจ้งเตือนภาษาไทยคมชัด 100% ผ่าน PowerShell (WindowStyle = Hidden ไม่กะพริบหน้าจอดำ)
strPs1Path = strScriptDir & "\scripts\show-popup.ps1"
If FSO.FileExists(strPs1Path) Then
    strPsCmd = "powershell.exe -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File """ & strPs1Path & """"
    WshShell.Run strPsCmd, 0, False
Else
    ' Fallback หากไม่พบไฟล์ show-popup.ps1
    strUrlFile = strScriptDir & "\webhook-url.txt"
    strWebhook = ""
    If FSO.FileExists(strUrlFile) Then
        On Error Resume Next
        Set objFile = FSO.OpenTextFile(strUrlFile, 1)
        strWebhook = Trim(objFile.ReadAll)
        objFile.Close
        On Error GoTo 0
    End If
    strMsg = "N3 Lottery Bot started successfully in background!" & vbCrLf & vbCrLf
    If strWebhook <> "" Then
        strMsg = strMsg & "LINE Webhook: " & strWebhook & vbCrLf & vbCrLf
    End If
    strMsg = strMsg & "Headless Chrome is active in background." & vbCrLf & _
             "Manage bot via: N3-MANAGER.bat" & vbCrLf & _
             "Stop bot via: STOP-BOT.bat"
    WshShell.Popup strMsg, 4, "N3 Lottery Bot Service", 64
End If
