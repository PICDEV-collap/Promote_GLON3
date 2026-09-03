' VBScript to launch N3 Bot Service silently in background without any console window
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
currentDir = fso.GetParentFolderName(WScript.ScriptFullName)

WshShell.CurrentDirectory = currentDir
WshShell.Run "cmd.exe /c """ & currentDir & "\START-BOT.bat""", 0, False
