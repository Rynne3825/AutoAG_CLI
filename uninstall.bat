@echo off
title AutoAG CLI - High Performance Uninstaller
echo Launching AutoAG CLI Uninstaller...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\uninstaller.ps1"
pause
