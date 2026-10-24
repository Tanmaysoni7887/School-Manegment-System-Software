@echo off
title MD Convent SMS - Setup
color 0C
echo.
echo  ============================================
echo   MD Convent Public School - SMS Setup
echo   Amanpur (Kasganj)
echo  ============================================
echo.

:: Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Node.js not found!
    echo.
    echo  Please install Node.js first:
    echo  1. Open browser
    echo  2. Go to: https://nodejs.org
    echo  3. Download "LTS" version
    echo  4. Install it (just click Next Next Finish)
    echo  5. Run this file again
    echo.
    pause
    exit /b
)

echo  [OK] Node.js found.
echo.
echo  Installing app (first time only, takes 2-3 minutes)...
echo.

npm install
if %errorlevel% neq 0 (
    echo  [ERROR] Installation failed. Check internet connection.
    pause
    exit /b
)

echo.
echo  [OK] Installation complete!
echo  Starting MD Convent SMS...
echo.
npm start
