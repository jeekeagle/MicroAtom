@echo off
setlocal EnableExtensions
call "%~dp0scripts\set-env.cmd"

echo Backing up course data. Keep the service closed while copying large media.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\backup-data.ps1"
set "EXIT_CODE=%ERRORLEVEL%"
if /i not "%KEXU_NO_PAUSE%"=="1" pause
exit /b %EXIT_CODE%
