@echo off
title AutoAG CLI - High Performance Patch Installer
echo ===================================================
echo   AutoAG CLI - High Performance Patch Installer   
echo ===================================================
echo Waiting 5 seconds for the agent to finish its response...
timeout /t 5 /nobreak > nul

echo Stopping Antigravity...
taskkill /f /im Antigravity.exe > nul 2>&1
timeout /t 2 /nobreak > nul

echo Restoring original app.asar from backup...
if exist "C:\Users\Rynne\AppData\Local\Programs\Antigravity\resources\app.asar.bak" (
    copy /y "C:\Users\Rynne\AppData\Local\Programs\Antigravity\resources\app.asar.bak" "C:\Users\Rynne\AppData\Local\Programs\Antigravity\resources\app.asar" > nul
) else if exist "C:\Program Files\Antigravity\resources\app.asar.bak" (
    copy /y "C:\Program Files\Antigravity\resources\app.asar.bak" "C:\Program Files\Antigravity\resources\app.asar" > nul
)

echo Applying the ultra-optimized preloader patch...
powershell -NoProfile -ExecutionPolicy Bypass -Command ".\patcher.ps1 -NoKill"

echo Relaunching Antigravity...
if exist "C:\Users\Rynne\AppData\Local\Programs\Antigravity\Antigravity.exe" (
    start "" "C:\Users\Rynne\AppData\Local\Programs\Antigravity\Antigravity.exe"
) else if exist "C:\Program Files\Antigravity\Antigravity.exe" (
    start "" "C:\Program Files\Antigravity\Antigravity.exe"
)

echo Success! Patch applied perfectly and Antigravity relaunched!
exit
