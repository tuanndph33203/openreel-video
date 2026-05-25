@echo off
title OpenReel Jobs Launcher (PowerShell)
echo Starting Vite and TTS servers as PowerShell Background Jobs...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run.ps1"
pause
