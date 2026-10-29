@echo off
setlocal EnableExtensions
call "%~dp0scripts\set-env.cmd"

echo.
echo [1/5] Node.js
if exist "%KEXU_NODE%" ("%KEXU_NODE%" --version) else (echo MISSING)

echo [2/5] Python / edge-tts
if exist "%KEXU_PYTHON%" (
  "%KEXU_PYTHON%" -c "import importlib.metadata as m; print('Python OK, edge-tts', m.version('edge-tts'))"
) else (
  echo MISSING
)

echo [3/5] FFmpeg
if exist "%KEXU_FFMPEG%" (
  "%KEXU_FFMPEG%" -version 2>nul | findstr /B /C:"ffmpeg version"
) else (
  echo MISSING
)

echo [4/5] Browser
if defined CHROME_PATH (echo %CHROME_PATH%) else (echo MISSING - install Chrome or Edge)

echo [5/5] Service diagnostics
echo API: %KEXU_BASE_URL%
"%KEXU_NODE%" "%KEXU_ROOT%\app\cli\kexu.mjs" doctor
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if /i not "%KEXU_NO_PAUSE%"=="1" pause
exit /b %EXIT_CODE%
