@echo off
title AutoAG CLI - High Performance Installer
echo Launching AutoAG CLI Installer...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\patcher.ps1"
pause
