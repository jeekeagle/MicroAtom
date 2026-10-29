@echo off
setlocal EnableExtensions
call "%~dp0scripts\set-env.cmd"

if not exist "%KEXU_NODE%" (
  echo [ERROR] Runtime missing: %KEXU_NODE%
  exit /b 1
)

"%KEXU_NODE%" "%KEXU_ROOT%\app\cli\kexu.mjs" %*
exit /b %ERRORLEVEL%
