[CmdletBinding()]
param(
  [switch]$EnableLan,
  [switch]$NoShortcut,
  [switch]$NoPause
)

$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location $root

function Write-Step {
  param([int]$Index, [int]$Total, [string]$Message)
  Write-Host ("[{0}/{1}] {2}" -f $Index, $Total, $Message) -ForegroundColor Cyan
}

Write-Host ''
Write-Host '课序 KEXU 一键安装' -ForegroundColor Green
Write-Host "安装目录: $root"
Write-Host ''

Write-Step 1 5 '检查安装包完整性...'
$required = @(
  'runtime\node\node.exe',
  'runtime\python\python.exe',
  'runtime\ffmpeg\bin\ffmpeg.exe',
  'runtime\ffmpeg\bin\ffprobe.exe',
  'app\server\index.ts',
  'app\cli\kexu.mjs',
  'app\node_modules\tsx\dist\cli.mjs',
  'app\dist\index.html',
  '一键启动.cmd'
)
$missing = @()
foreach ($rel in $required) {
  if (-not (Test-Path -LiteralPath (Join-Path $root $rel))) { $missing += $rel }
}
if ($missing.Count -gt 0) {
  Write-Host '安装包不完整，缺少以下文件：' -ForegroundColor Red
  $missing | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
  Write-Host '请重新解压完整压缩包后再运行一键安装。' -ForegroundColor Yellow
  exit 1
}
Write-Host '  完整性检查通过' -ForegroundColor Green

Write-Step 2 5 '准备课程数据目录...'
$dataDir = Join-Path $root 'data'
New-Item -ItemType Directory -Force -Path $dataDir, (Join-Path $dataDir 'media') | Out-Null
Write-Host "  $dataDir"

Write-Step 3 5 '检查运行配置...'
$configDir = Join-Path $root 'config'
$envFile = Join-Path $configDir 'kexu.env.cmd'
$envExample = Join-Path $configDir 'kexu.env.example.cmd'
New-Item -ItemType Directory -Force -Path $configDir | Out-Null
if (-not (Test-Path -LiteralPath $envFile) -and (Test-Path -LiteralPath $envExample)) {
  Copy-Item -LiteralPath $envExample -Destination $envFile -Force
  Write-Host '  已生成 config\kexu.env.cmd（默认端口 8787，保持注释即用默认值）'
} else {
  Write-Host '  已有配置文件，保持不变'
}

Write-Step 4 5 '创建桌面与开始菜单快捷方式...'
if ($NoShortcut) {
  Write-Host '  已跳过（参数 -NoShortcut）'
} else {
  $desktop = [Environment]::GetFolderPath('Desktop')
  $startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
  $shell = New-Object -ComObject WScript.Shell
  foreach ($dir in @($desktop, $startMenu)) {
    $lnkPath = Join-Path $dir '课序 KEXU.lnk'
    $shortcut = $shell.CreateShortcut($lnkPath)
    $shortcut.TargetPath = Join-Path $root '一键启动.cmd'
    $shortcut.WorkingDirectory = $root
    $shortcut.Description = '课序 Agent 微课制作系统'
    $shortcut.IconLocation = "$env:WINDIR\System32\shell32.dll,165"
    $shortcut.Save()
    Write-Host "  已创建: $lnkPath"
  }
}

Write-Step 5 5 '完成...'
if ($EnableLan) {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  $isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $isAdmin) {
    Write-Host '  局域网防火墙需要管理员权限：请用管理员 PowerShell 运行本脚本并加 -EnableLan。' -ForegroundColor Yellow
  } else {
    foreach ($port in 8787, 8788) {
      try {
        New-NetFirewallRule -DisplayName "课序 KEXU (TCP $port)" -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow -ErrorAction Stop | Out-Null
        Write-Host "  已放行防火墙端口 $port"
      } catch {
        Write-Host "  端口 $port 放行失败: $($_.Exception.Message)" -ForegroundColor Yellow
      }
    }
  }
}

Write-Host ''
Write-Host '安装完成！' -ForegroundColor Green
Write-Host '下一步：双击「一键启动.cmd」，或双击桌面的「课序 KEXU」。'
Write-Host '首次使用 AI 前，请在系统「运行设置 - 模型配置」中填写模型服务地址与 API Key。'
Write-Host '详细说明见《安装说明.md》与《使用说明.md》。'
Write-Host ''
if (-not $NoPause) { pause }
exit 0