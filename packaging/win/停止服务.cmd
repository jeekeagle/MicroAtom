@echo off
setlocal EnableExtensions
call "%~dp0scripts\set-env.cmd"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop.ps1" -Port %PORT%
set "EXIT_CODE=%ERRORLEVEL%"
if /i not "%KEXU_NO_PAUSE%"=="1" pause
exit /b %EXIT_CODE%