@echo off
setlocal enabledelayedexpansion
title MD Convent SMS - Setup
color 0C
cd /d "%~dp0"
set "APP_DIR=%~dp0"
if "%APP_DIR:~-1%"=="\" set "APP_DIR=%APP_DIR:~0,-1%"

echo.
echo  ============================================
echo   MD Convent Public School - SMS Setup
echo   Amanpur (Kasganj)
echo  ============================================
echo.

node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Node.js nahi mila!
    echo  nodejs.org par jaao aur LTS download karo.
    pause
    exit /b
)
echo  [OK] Node.js mila.
echo.
echo  Installing... (2-3 minute lagenge, internet chahiye)
npm install
if %errorlevel% neq 0 (
    echo  [ERROR] Install fail hua. Internet check karo.
    pause
    exit /b
)
echo.
echo  [OK] Install complete!
echo.
echo  Desktop shortcut bana raha hoon...

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
       Write-Host \" [OK] Desktop shortcut updated: $lnk\"; ^
     } ^
   }"

echo  [OK] Desktop shortcut ban gaya!
echo.
echo  ============================================
echo   Setup complete! App ab start ho rahi hai...
echo  ============================================
echo.

:: Start app
npm start
