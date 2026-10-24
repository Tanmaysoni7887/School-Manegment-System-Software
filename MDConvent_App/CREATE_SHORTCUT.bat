@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
set "APP_DIR=%~dp0"
if "%APP_DIR:~-1%"=="\" set "APP_DIR=%APP_DIR:~0,-1%"

echo ========================================================
echo  MD Convent SMS - Desktop Shortcut Generator
echo ========================================================
echo App Directory: %APP_DIR%
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$appDir = '%APP_DIR%'.TrimEnd('\'); ^
   $vbsPath = Join-Path $appDir 'silent_launch.vbs'; ^
   $iconPath = Join-Path $appDir 'icon.ico'; ^
   $wscript = New-Object -ComObject WScript.Shell; ^
   $desktops = @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('CommonDesktopDirectory'), \"$env:USERPROFILE\Desktop\"); ^
   $uniqueDesktops = $desktops | Select-Object -Unique; ^
   foreach ($d in $uniqueDesktops) { ^
     if (Test-Path $d) { ^
       $lnk = Join-Path $d 'MD Convent SMS.lnk'; ^
       $s = $wscript.CreateShortcut($lnk); ^
       $s.TargetPath = 'wscript.exe'; ^
       $s.Arguments = '\"' + $vbsPath + '\"'; ^
       $s.WorkingDirectory = $appDir; ^
       if (Test-Path $iconPath) { $s.IconLocation = $iconPath + ',0'; } ^
       $s.Description = 'MD Convent Public School SMS'; ^
       $s.Save(); ^
       Write-Host \"[OK] Shortcut updated at: $lnk\"; ^
     } ^
   }"

echo.
echo [SUCCESS] Desktop shortcut successfully created and verified!
echo You can now launch MD Convent SMS directly from your Desktop.
echo.
pause
