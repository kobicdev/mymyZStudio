@echo off
:: 이 배치파일은 반드시 cmd.exe 환경에서 실행해야 합니다.
if not "%COMSPEC%"=="%SystemRoot%\system32\cmd.exe" (
    cmd /c "%~f0"
    exit /b
)

chcp 65001 > nul
title ZImageStudio - Production

echo.
echo  +========================================+
echo  ^|    ZImageStudio  [PRODUCTION]         ^|
echo  +========================================+
echo.

:: --- Step 1: Kill previous processes ---
echo  [1/4] Killing previous processes...

taskkill /F /IM electron.exe /T  > nul 2>&1
taskkill /F /IM sd.exe /T        > nul 2>&1
node scripts\kill-port.js 5173

timeout /t 1 /nobreak > nul
echo  [1/4] Done.

:: --- Step 2: Check dependencies ---
echo  [2/4] Checking dependencies...

if not exist "node_modules\" (
    echo  [!] node_modules not found - running npm install...
    npm install --ignore-scripts
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

npx electron .

if errorlevel 1 (
    echo.
    echo  [ERROR] App exited with an error.
    pause
)
