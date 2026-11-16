Dim objShell, objFSO, appDir
Set objShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")

If WScript.Arguments.Count > 0 And objFSO.FolderExists(WScript.Arguments(0)) Then
    appDir = WScript.Arguments(0)
Else
    appDir = objFSO.GetParentFolderName(WScript.ScriptFullName)
End If

objShell.CurrentDirectory = appDir
objShell.Run "cmd /c npm start", 0, False
