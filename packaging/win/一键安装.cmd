@echo off
setlocal EnableExtensions
title KEXU - One-click Install
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install.ps1" %*
set "EXIT_CODE=%ERRORLEVEL%"
if /i not "%KEXU_NO_PAUSE%"=="1" pause
exit /b %EXIT_CODE%