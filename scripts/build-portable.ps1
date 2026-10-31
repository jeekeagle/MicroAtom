[CmdletBinding()]
param(
  [string]$OutputRoot,
  [string]$PythonVersion = '3.12.10',
  [switch]$SkipBuild,
  [switch]$SkipZip,
  [switch]$SkipDataBackup
)

$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $OutputRoot) {
  $OutputRoot = Join-Path $workspace 'release'
}
$OutputRoot = [IO.Path]::GetFullPath($OutputRoot)
if (-not $OutputRoot.StartsWith($workspace, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'OutputRoot must stay inside the workspace.'
}

$package = Get-Content -Raw -Encoding UTF8 (Join-Path $workspace 'package.json') | ConvertFrom-Json
$stamp = Get-Date -Format 'yyyyMMdd'
$stageName = 'kexu-portable-win-x64'
$stage = Join-Path $OutputRoot $stageName
$zipName = "kexu-portable-win-x64-$($package.version)-$stamp.zip"
$zipPath = Join-Path $OutputRoot $zipName
$cache = Join-Path $workspace 'packaging\.cache'

New-Item -ItemType Directory -Force -Path $OutputRoot, $cache | Out-Null
$resolvedOutput = [IO.Path]::GetFullPath($OutputRoot)
$resolvedStage = [IO.Path]::GetFullPath($stage)
if (-not $resolvedStage.StartsWith($resolvedOutput, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Unsafe staging path.'
}
if (Test-Path -LiteralPath $resolvedStage) {
  Remove-Item -LiteralPath $resolvedStage -Recurse -Force
}

$app = Join-Path $stage 'app'
$data = Join-Path $stage 'data'
$runtimeNode = Join-Path $stage 'runtime\node'
$runtimePython = Join-Path $stage 'runtime\python'
$runtimeFfmpeg = Join-Path $stage 'runtime\ffmpeg\bin'
$docs = Join-Path $stage 'docs'
$config = Join-Path $stage 'config'
$scripts = Join-Path $stage 'scripts'
$licenses = Join-Path $stage 'licenses'
$Backups = Join-Path $stage 'backups'

@($app, $data, $runtimeNode, $runtimePython, $runtimeFfmpeg, $docs, $config, $scripts, $licenses, $Backups) |
  ForEach-Object { New-Item -ItemType Directory -Force -Path $_ | Out-Null }

if (-not $SkipBuild) {
  Write-Host '[1/8] Building web application...'
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw 'npm run build failed.' }
} else {
  Write-Host '[1/8] Build skipped.'
}

Write-Host '[2/8] Copying application...'
foreach ($file in @('package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'index.html')) {
  Copy-Item -LiteralPath (Join-Path $workspace $file) -Destination $app -Force
}
foreach ($dir in @('server', 'src', 'cli', 'dist', 'node_modules')) {
  Copy-Item -LiteralPath (Join-Path $workspace $dir) -Destination $app -Recurse -Force
}

Write-Host '[3/8] Copying course data...'
$dataExcluded = @('secrets.json', 'ui-check', 'shot-test', 'tts-test', 'backups')
Get-ChildItem -LiteralPath (Join-Path $workspace 'data') -Force | Where-Object {
  $dataExcluded -notcontains $_.Name
} | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination $data -Recurse -Force
}
if (-not (Test-Path -LiteralPath (Join-Path $data 'media'))) {
  New-Item -ItemType Directory -Path (Join-Path $data 'media') | Out-Null
}

Write-Host '[4/8] Copying Node.js runtime...'
$nodeCommand = Get-Command node.exe -ErrorAction Stop
$nodeSource = Split-Path -Parent $nodeCommand.Source
Copy-Item -LiteralPath $nodeCommand.Source -Destination $runtimeNode -Force
if (Test-Path -LiteralPath (Join-Path $nodeSource 'LICENSE')) {
  Copy-Item -LiteralPath (Join-Path $nodeSource 'LICENSE') -Destination (Join-Path $licenses 'Node.js-LICENSE.txt') -Force
}

Write-Host '[5/8] Preparing embedded Python + edge-tts...'
$pythonZipName = "python-$PythonVersion-embed-amd64.zip"
$pythonZip = Join-Path $cache $pythonZipName
if (-not (Test-Path -LiteralPath $pythonZip)) {
  $pythonUrl = "https://www.python.org/ftp/python/$PythonVersion/$pythonZipName"
  Invoke-WebRequest -Uri $pythonUrl -OutFile $pythonZip
}
Expand-Archive -LiteralPath $pythonZip -DestinationPath $runtimePython -Force

$pth = Get-ChildItem -LiteralPath $runtimePython -Filter 'python*._pth' | Select-Object -First 1
if (-not $pth) { throw 'Embedded Python ._pth file not found.' }
$stdlibZip = Get-ChildItem -LiteralPath $runtimePython -Filter 'python*.zip' | Select-Object -First 1
if (-not $stdlibZip) { throw 'Embedded Python standard library ZIP not found.' }
$pthText = @(
  $stdlibZip.Name,
  '.',
  'Lib\site-packages',
  'import site'
) -join "`r`n"
[IO.File]::WriteAllText($pth.FullName, $pthText + "`r`n", [Text.UTF8Encoding]::new($false))

$sitePackages = Join-Path $runtimePython 'Lib\site-packages'
New-Item -ItemType Directory -Force -Path $sitePackages | Out-Null
& python -m pip install --disable-pip-version-check --no-warn-script-location `
  --target $sitePackages 'edge-tts==7.3.1'
if ($LASTEXITCODE -ne 0) { throw 'Failed to install edge-tts into the portable Python runtime.' }
& (Join-Path $runtimePython 'python.exe') -c "import importlib.metadata as m; print('edge-tts', m.version('edge-tts'))"
if ($LASTEXITCODE -ne 0) { throw 'Portable edge-tts verification failed.' }

Write-Host '[6/8] Copying FFmpeg...'
$ffmpegRoot = Join-Path $env:APPDATA 'LobsterAI\huashu-motion\tools\ffmpeg\bin'
$ffmpeg = Join-Path $ffmpegRoot 'ffmpeg.exe'
$ffprobe = Join-Path $ffmpegRoot 'ffprobe.exe'
if (-not (Test-Path -LiteralPath $ffmpeg) -or -not (Test-Path -LiteralPath $ffprobe)) {
  throw "FFmpeg binaries not found at $ffmpegRoot"
}
Copy-Item -LiteralPath $ffmpeg, $ffprobe -Destination $runtimeFfmpeg -Force

Write-Host '[7/8] Copying launchers and documentation...'
foreach ($file in @('start-kexu.cmd', 'kexu.cmd', 'check-env.cmd', 'backup-data.cmd', '一键安装.cmd', '一键启动.cmd', '停止服务.cmd')) {
  Copy-Item -LiteralPath (Join-Path $workspace "packaging\win\$file") -Destination $stage -Force
}
Get-ChildItem -LiteralPath (Join-Path $workspace 'packaging\win\scripts') -File |
  ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $scripts -Force }
Copy-Item -LiteralPath (Join-Path $workspace 'packaging\win\config\kexu.env.example.cmd') -Destination $config -Force
Copy-Item -LiteralPath (Join-Path $workspace 'README.md') -Destination $stage -Force
foreach ($file in @('安装说明.md', '使用说明.md')) {
  Copy-Item -LiteralPath (Join-Path $workspace "packaging\win\$file") -Destination $stage -Force
}
Get-ChildItem -LiteralPath (Join-Path $workspace 'docs') -File |
  ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $docs -Force }

$ffmpegNotice = @'
FFmpeg / FFprobe
=================
The portable package includes FFmpeg binaries for Windows x64.
Upstream: https://ffmpeg.org/
Source code: https://ffmpeg.org/download.html#get-sources
License information: https://ffmpeg.org/legal.html

The bundled ffmpeg build reports --enable-gpl. Redistribution must comply with
the GNU GPL, including providing corresponding source code or a valid written
offer. This notice is not a substitute for the license text.
'@
[IO.File]::WriteAllText((Join-Path $licenses 'FFmpeg-NOTICE.txt'), $ffmpegNotice, [Text.UTF8Encoding]::new($false))

$buildInfo = @(
  "Package: $($package.name) $($package.version)",
  "Built: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')",
  "Platform: Windows x64",
  "Node: $(& $nodeCommand.Source --version)",
  "Python: $(& (Join-Path $runtimePython 'python.exe') --version 2>&1)",
  "edge-tts: 7.3.1",
  "FFmpeg source: $ffmpegRoot",
  'API bind: 127.0.0.1 only',
  'Data path: <package>\data'
) -join "`r`n"
[IO.File]::WriteAllText((Join-Path $stage 'BUILD-INFO.txt'), $buildInfo + "`r`n", [Text.UTF8Encoding]::new($false))

Write-Host '[8/8] Creating archives...'
$requiredFiles = @(
  'start-kexu.cmd',
  'kexu.cmd',
  'check-env.cmd',
  'backup-data.cmd',
  '一键安装.cmd',
  '一键启动.cmd',
  '停止服务.cmd',
  '安装说明.md',
  '使用说明.md',
  'scripts\install.ps1',
  'scripts\stop.ps1',
  'README.md',
  'BUILD-INFO.txt',
  'scripts\set-env.cmd',
  'scripts\open-when-ready.ps1',
  'scripts\backup-data.ps1',
  'config\kexu.env.example.cmd',
  'app\server\index.ts',
  'app\cli\kexu.mjs',
  'app\dist\index.html',
  'runtime\node\node.exe',
  'runtime\python\python.exe',
  'runtime\ffmpeg\bin\ffmpeg.exe',
  'runtime\ffmpeg\bin\ffprobe.exe'
)
foreach ($relativePath in $requiredFiles) {
  if (-not (Test-Path -LiteralPath (Join-Path $stage $relativePath))) {
    throw "Portable package is incomplete: $relativePath"
  }
}
$docCount = @(Get-ChildItem -LiteralPath $docs -File -Filter '*.md').Count
if ($docCount -lt 8) {
  throw "Portable package documentation is incomplete: expected at least 8 guides, found $docCount."
}
if (Test-Path -LiteralPath (Join-Path $data 'secrets.json')) {
  throw 'Refusing to package data/secrets.json.'
}

if (-not $SkipZip) {
  if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
  Compress-Archive -LiteralPath $stage -DestinationPath $zipPath -CompressionLevel Optimal
}

$dataZip = $null
if (-not $SkipDataBackup) {
  $dataStage = Join-Path $OutputRoot '.data-backup-stage'
  if (Test-Path -LiteralPath $dataStage) {
    $resolvedDataStage = [IO.Path]::GetFullPath($dataStage)
    if ($resolvedDataStage.StartsWith($resolvedOutput, [StringComparison]::OrdinalIgnoreCase)) {
      Remove-Item -LiteralPath $resolvedDataStage -Recurse -Force
    }
  }
  $dataStageData = Join-Path $dataStage 'data'
  New-Item -ItemType Directory -Force -Path $dataStageData | Out-Null
  Get-ChildItem -LiteralPath (Join-Path $workspace 'data') -Force | Where-Object {
    $dataExcluded -notcontains $_.Name
  } | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $dataStageData -Recurse -Force
  }
  $dataZip = Join-Path $OutputRoot "kexu-data-backup-$stamp.zip"
  if (Test-Path -LiteralPath $dataZip) { Remove-Item -LiteralPath $dataZip -Force }
  Compress-Archive -LiteralPath $dataStageData -DestinationPath $dataZip -CompressionLevel Optimal
  $resolvedDataStage = [IO.Path]::GetFullPath($dataStage)
  if ($resolvedDataStage.StartsWith($resolvedOutput, [StringComparison]::OrdinalIgnoreCase)) {
    Remove-Item -LiteralPath $resolvedDataStage -Recurse -Force
  }


}

$checksums = @()
$archiveFiles = @($zipPath)
if ($dataZip) { $archiveFiles += $dataZip }
foreach ($file in $archiveFiles) {
  if (Test-Path -LiteralPath $file) {
    $hash = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash
    $checksums += "$hash  $([IO.Path]::GetFileName($file))"
  }
}
$checksumPath = Join-Path $OutputRoot "SHA256SUMS.txt"
[IO.File]::WriteAllText($checksumPath, ($checksums -join "`r`n") + "`r`n", [Text.UTF8Encoding]::new($false))

Write-Host ''
Write-Host "[OK] Portable directory: $stage"
if (-not $SkipZip) { Write-Host "[OK] Portable ZIP: $zipPath" }
if ($dataZip) { Write-Host "[OK] Data backup: $dataZip" } else { Write-Host "[OK] Data backup skipped (-SkipDataBackup)." }
Write-Host "[OK] Checksums: $checksumPath"
