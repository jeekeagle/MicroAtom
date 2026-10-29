@echo off
setlocal EnableExtensions
title KEXU - Agent Micro Course Studio
call "%~dp0scripts\set-env.cmd"

if not exist "%KEXU_NODE%" (
  echo [ERROR] Runtime missing: %KEXU_NODE%
  echo Re-extract the complete package before starting.
  pause
  exit /b 1
)
if not exist "%KEXU_ROOT%\app\node_modules\tsx\dist\cli.mjs" (
  echo [ERROR] Application dependencies are missing.
  echo Re-extract the complete package before starting.
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { $r=Invoke-RestMethod -Uri '%KEXU_BASE_URL%/api/health' -TimeoutSec 2; if($r.ok){exit 0} } catch {}; exit 1" ^
  >nul 2>nul
if not errorlevel 1 (
  echo [KEXU] The service is already running at %KEXU_BASE_URL%
  if /i not "%KEXU_NO_BROWSER%"=="1" start "" "%KEXU_BASE_URL%"
  exit /b 0
)

echo.
echo   KEXU Agent Micro Course Studio
echo   URL: %KEXU_BASE_URL%
echo   Data: %KEXU_DATA_DIR%
echo.
echo   Keep this window open while using the system.
echo   Press Ctrl+C to stop the service.
echo.

if /i not "%KEXU_NO_BROWSER%"=="1" (
  start "" /b powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden ^
    -File "%KEXU_ROOT%\scripts\open-when-ready.ps1" ^
    -HealthUrl "%KEXU_BASE_URL%/api/health" -Url "%KEXU_BASE_URL%" -TimeoutSeconds 90
)

cd /d "%KEXU_ROOT%"
"%KEXU_NODE%" "%KEXU_ROOT%\app\node_modules\tsx\dist\cli.mjs" "%KEXU_ROOT%\app\server\index.ts"
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if not "%EXIT_CODE%"=="0" (
  echo [ERROR] Service stopped with exit code %EXIT_CODE%.
  pause
)
exit /b %EXIT_CODE%
