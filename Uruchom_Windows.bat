@echo off
title CSV Studio
cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel% equ 0 (
    start "" wscript.exe "uruchom.vbs"
    exit
)

where python >nul 2>nul
if %errorlevel% equ 0 (
    start /min python -m http.server 8765
    timeout /t 1 /nobreak >nul
    start "" "http://127.0.0.1:8765"
    exit
)

start "" "index.html"
exit
