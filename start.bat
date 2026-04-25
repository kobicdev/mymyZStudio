@echo off
setlocal enabledelayedexpansion

:: ZImageStudio Production Startup Script
chcp 65001 > nul
title ZImageStudio - Production

echo.
echo  +========================================+
echo  ^|    ZImageStudio  [PRODUCTION]         ^|
echo  +========================================+
echo.

:: --- Step 1: Kill previous processes ---
echo  [1/4] Killing previous processes...

taskkill /F /IM electron.exe /T > nul 2>&1
taskkill /F /IM sd.exe /T > nul 2>&1
node scripts\kill-port.js 5173 > nul 2>&1

timeout /t 1 /nobreak > nul
echo  [1/4] Done.

:: --- Step 2: Check dependencies ---
echo  [2/4] Checking dependencies...

if not exist "node_modules\" (
    echo  [!] node_modules not found - running npm install...
    call npm install --ignore-scripts
    if errorlevel 1 (
        echo  [ERROR] npm install failed!
        pause
        exit /b 1
    )
)

:: better-sqlite3 native rebuild check (Sync with dev.bat)
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

echo  [2/4] Done.

:: --- Step 3: Build ---
echo  [3/4] Building (Vite + TypeScript)...
call npm run build
if errorlevel 1 (
    echo.
    echo  [ERROR] Build failed! Check the errors above.
    pause
    exit /b 1
)
echo  [3/4] Build complete.

:: --- Step 4: Launch ---
echo  [4/4] Launching ZImageStudio...
echo.
echo  +------------------------------------------+
echo  ^|  ZImageStudio is starting.               ^|
echo  ^|  This window stays open while running.   ^|
echo  +------------------------------------------+
echo.

:: Set NODE_ENV to production explicitly
set NODE_ENV=production
:: set DEBUG_ELECTRON=true
npx electron .

if errorlevel 1 (
    echo.
    echo  [ERROR] App exited with an error.
    pause
)

endlocal
