@echo off
set COMPILER=C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe
set OUT_EXE=%~dp0AutoAG_Tray.exe
set SRC_CS=%~dp0Program.cs
set SRC_ICON_GEN=%~dp0MakeIcon.cs
set OUT_ICON_EXE=%~dp0MakeIcon.exe
set ICO_FILE=%~dp0logo.ico

echo ===================================================
echo 🛠️ STEP 1: Building multi-resolution Icon Generator...
echo ===================================================
if exist "%SRC_ICON_GEN%" (
    "%COMPILER%" /target:exe /out:"%OUT_ICON_EXE%" /r:System.dll,System.Drawing.dll "%SRC_ICON_GEN%"
    if %ERRORLEVEL% equ 0 (
        echo 🚀 Generating logo.ico...
        "%OUT_ICON_EXE%"
        if exist "%OUT_ICON_EXE%" del "%OUT_ICON_EXE%"
    ) else (
        echo ❌ Failed to compile MakeIcon.cs, skipping icon generation.
    )
)

echo ===================================================
echo 🛠️ STEP 2: Compiling AutoAG System Tray app...
echo ===================================================

set ICON_FLAG=
if exist "%ICO_FILE%" (
    set ICON_FLAG=/win32icon:"%ICO_FILE%"
    echo 📦 Found logo.ico, compiling with custom file icon!
)

"%COMPILER%" /target:winexe %ICON_FLAG% /resource:"%~dp0logo.ico",AutoAG_CLI.logo.ico /resource:"%~dp0logo_disabled.ico",AutoAG_CLI.logo_disabled.ico /out:"%OUT_EXE%" /r:System.dll,System.Drawing.dll,System.Windows.Forms.dll "%SRC_CS%"

if %ERRORLEVEL% equ 0 (
    echo.
    echo ===================================================
    echo 🎉 Success! Executable compiled at:
    echo    %OUT_EXE%
    echo ===================================================
) else (
    echo.
    echo ❌ Compilation failed!
    pause
)
