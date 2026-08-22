Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.Run "cmd.exe /c node server.js", 0, False
WScript.Sleep 600
WshShell.Run "http://127.0.0.1:8765", 1, False
