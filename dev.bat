@echo off
setlocal enabledelayedexpansion

:: ZImageStudio Development Startup Script
chcp 65001 > nul
title ZImageStudio - Dev Mode

echo.
echo  +========================================+
echo  ^|    ZImageStudio  [DEV]                ^|
echo  +========================================+
echo.

:: --- Step 1: Kill previous processes ---
echo  [1/3] Killing previous processes...

taskkill /F /IM electron.exe /T > nul 2>&1
taskkill /F /IM sd.exe /T > nul 2>&1
node scripts\kill-port.js 5173 > nul 2>&1

timeout /t 1 /nobreak > nul
echo  [1/3] Done.

:: --- Step 2: Check dependencies ---
echo  [2/3] Checking dependencies...

if not exist "node_modules\" (
    echo  [!] node_modules not found - running npm install...
    call npm install --ignore-scripts
    if errorlevel 1 (
        echo  [ERROR] npm install failed!
        pause
        exit /b 1
    )
)

if not exist "node_modules\electron\dist\electron.exe" (
    echo  [!] Electron binary missing - downloading...
    node node_modules/electron/install.js
    if errorlevel 1 (
        echo  [ERROR] Electron install failed!
        pause
        exit /b 1
    )
)

:: better-sqlite3 native rebuild check
set "SQLITE_BINDING=node_modules\better-sqlite3\build\Release\better_sqlite3.node"
if not exist "%SQLITE_BINDING%" (
    echo  [!] better-sqlite3 needs rebuild for Electron...
    call npx electron-rebuild -f -w better-sqlite3
    if errorlevel 1 (
        echo  [WARN] electron-rebuild failed - DB features may not work
    ) else (
        echo  [OK] better-sqlite3 rebuilt successfully
    )
)

echo  [2/3] Done.

:: --- Step 3: Start dev server ---
echo  [3/3] Starting dev server...
echo.
echo  +------------------------------------------+
echo  ^|  Vite  : http://localhost:5173            ^|
echo  ^|  Electron window opens automatically.    ^|
echo  ^|  Quit: Ctrl+C  or close the window.      ^|
echo  +------------------------------------------+
echo.

call npm run dev

if errorlevel 1 (
    echo.
    echo  [ERROR] Dev server exited with an error.
    pause
)

endlocal
