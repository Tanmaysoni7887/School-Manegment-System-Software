@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
set "APP_DIR=%~dp0"
if "%APP_DIR:~-1%"=="\" set "APP_DIR=%APP_DIR:~0,-1%"

echo ========================================================
echo  SHIKSHA - School Management Software - Desktop Shortcut
echo ========================================================
echo App Directory: %APP_DIR%
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "$appDir = '%APP_DIR%'.TrimEnd('\'); $vbsPath = Join-Path $appDir 'silent_launch.vbs'; $iconPath = Join-Path $appDir 'icon.ico'; $wscript = New-Object -ComObject WScript.Shell; $desktops = @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('CommonDesktopDirectory'), (Join-Path $env:USERPROFILE 'Desktop')) | Select-Object -Unique; foreach ($d in $desktops) { if (Test-Path $d) { $oldLnk = Join-Path $d 'MD Convent SMS.lnk'; if (Test-Path $oldLnk) { Remove-Item $oldLnk -Force -ErrorAction SilentlyContinue }; $lnk = Join-Path $d 'SHIKSHA - School Management Software.lnk'; $s = $wscript.CreateShortcut($lnk); $s.TargetPath = 'wscript.exe'; $s.Arguments = '\"' + $vbsPath + '\"'; $s.WorkingDirectory = $appDir; if (Test-Path $iconPath) { $s.IconLocation = $iconPath + ',0' }; $s.Description = 'SHIKSHA - School Management Software'; $s.Save(); Write-Host ('[OK] Shortcut updated at: ' + $lnk) } }"

echo.
echo [SUCCESS] Desktop shortcut successfully created and verified!
echo You can now launch SHIKSHA directly from your Desktop.
echo.
pause
