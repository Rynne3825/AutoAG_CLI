@echo off
title AutoAG CLI - Uninstaller
echo Khoi chay Trinh go cai dat AutoAG CLI...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstaller.ps1"
pause
