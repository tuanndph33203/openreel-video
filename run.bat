@echo off
title OpenReel Launcher
echo ===================================================
echo      STARTING OPENREEL DEVELOPER ENVIRONMENT
echo ===================================================
echo.

echo [1/2] Starting Vite Web Server...
start "Vite Web Server" cmd /k "cd /d %~dp0 && npx pnpm dev"

echo [2/2] Starting Python TTS Server...
start "Python TTS Server" cmd /k "cd /d %~dp0apps\tts-server && py -u main.py"

echo.
echo ===================================================
echo Both servers have been launched in separate windows!
echo You can safely close this main window.
echo ===================================================
timeout /t 5
