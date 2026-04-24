@echo off
if not "%COMSPEC%"=="%SystemRoot%\system32\cmd.exe" (
    cmd /c "%~f0"
    exit /b
)

chcp 65001 > nul
title ZImageStudio - Kill All

echo.
echo  +========================================+
echo  ^|    ZImageStudio  Kill All              ^|
echo  +========================================+
echo.
echo  Terminating all ZImageStudio processes...

taskkill /F /IM electron.exe /T  > nul 2>&1
echo  [OK] electron.exe terminated.

taskkill /F /IM sd.exe /T        > nul 2>&1
echo  [OK] sd.exe terminated.

node scripts\kill-port.js 5173

echo.
echo  Done. Closing in 2 seconds...
timeout /t 2 /nobreak > nul
