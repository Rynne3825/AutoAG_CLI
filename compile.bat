@echo off
set COMPILER=C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe
set OUT_EXE=%~dp0AutoAG_Tray.exe
set SRC_CS=%~dp0Program.cs

echo Compiling AutoAG System Tray app...
"%COMPILER%" /target:winexe /out:"%OUT_EXE%" /r:System.dll,System.Drawing.dll,System.Windows.Forms.dll "%SRC_CS%"

if %ERRORLEVEL% equ 0 (
    echo Compilation successful! Executable is at %OUT_EXE%
) else (
    echo Compilation failed!
    pause
)
