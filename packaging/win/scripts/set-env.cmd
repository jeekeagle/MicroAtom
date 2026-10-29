@echo off
rem Shared environment for the portable package. Do not run directly.

set "KEXU_ROOT=%~dp0.."
for %%I in ("%KEXU_ROOT%") do set "KEXU_ROOT=%%~fI"

set "KEXU_NODE=%KEXU_ROOT%\runtime\node\node.exe"
set "KEXU_PYTHON=%KEXU_ROOT%\runtime\python\python.exe"
set "KEXU_FFMPEG=%KEXU_ROOT%\runtime\ffmpeg\bin\ffmpeg.exe"
set "KEXU_FFPROBE=%KEXU_ROOT%\runtime\ffmpeg\bin\ffprobe.exe"

set "PATH=%KEXU_ROOT%\runtime\node;%KEXU_ROOT%\runtime\python;%KEXU_ROOT%\runtime\ffmpeg\bin;%PATH%"
set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"
set "FFMPEG_PATH=%KEXU_FFMPEG%"
set "FFPROBE_PATH=%KEXU_FFPROBE%"
set "KEXU_DATA_DIR=%KEXU_ROOT%\data"

if exist "%KEXU_ROOT%\config\kexu.env.cmd" call "%KEXU_ROOT%\config\kexu.env.cmd"

if not defined PORT set "PORT=8787"
if not defined KEXU_BASE_URL set "KEXU_BASE_URL=http://127.0.0.1:%PORT%"

if not defined CHROME_PATH (
  if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    set "CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe"
  ) else if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
    set "CHROME_PATH=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
  ) else if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    set "CHROME_PATH=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
  ) else if exist "C:\Program Files\Microsoft\Edge\Application\msedge.exe" (
    set "CHROME_PATH=C:\Program Files\Microsoft\Edge\Application\msedge.exe"
  )
)
