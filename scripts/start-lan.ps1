[CmdletBinding()]
param(
  [int]$Port = 8787,
  [int]$HttpsPort = 8788,
  [switch]$NoBrowser,
  [switch]$Restart
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Get-PrimaryLanAddress {
  $route = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue |
    Sort-Object RouteMetric, InterfaceMetric |
    Select-Object -First 1
  if ($route) {
    $address = Get-NetIPAddress -AddressFamily IPv4 -InterfaceIndex $route.InterfaceIndex -ErrorAction SilentlyContinue |
      Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
      Select-Object -First 1
    if ($address) { return $address.IPAddress }
  }

  $fallback = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
      $_.IPAddress -notlike '127.*' -and
      $_.IPAddress -notlike '169.254.*' -and
      $_.IPAddress -notlike '192.168.64.*'
    } |
    Select-Object -First 1
  if ($fallback) { return $fallback.IPAddress }
  return $null
}

function Get-ListenerInfo {
  param([int]$TargetPort)
  $result = @()
  $connections = Get-NetTCPConnection -LocalPort $TargetPort -State Listen -ErrorAction SilentlyContinue
  foreach ($connection in $connections) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($connection.OwningProcess)" -ErrorAction SilentlyContinue
    $result += [pscustomobject]@{
      Address = $connection.LocalAddress
      Process = $process
      IsOurs = [bool]($process -and $process.CommandLine -like "*$root*")
    }
  }
  return $result
}

function Test-StudioHealth {
  param([string]$BaseUrl)
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "$BaseUrl/api/health" -TimeoutSec 3
    if ($response.StatusCode -ne 200) { return $false }
    # Another app can answer on the same port, so confirm this is the course studio.
    return $response.Content -match '"capabilities"'
  } catch {
    return $false
  }
}

$lanAddress = Get-PrimaryLanAddress
$lanUrl = if ($lanAddress) { "http://${lanAddress}:$Port" } else { "http://<本机局域网 IP>:$Port" }
$httpsUrl = if ($lanAddress) { "https://${lanAddress}:$HttpsPort" } else { $null }
$healthBase = if ($lanAddress) { "http://${lanAddress}:$Port" } else { "http://127.0.0.1:$Port" }

$listeners = Get-ListenerInfo -TargetPort $Port
$ours = $listeners | Where-Object { $_.IsOurs } | Select-Object -First 1
$foreign = $listeners | Where-Object { -not $_.IsOurs } | Select-Object -First 1

if ($foreign -and $foreign.Process) {
  Write-Host "端口 $Port 上还有另一个程序：$($foreign.Process.Name)（PID $($foreign.Process.ProcessId)）" -ForegroundColor Yellow
  Write-Host "本机访问 127.0.0.1:$Port 会先落到那个程序上，课序请用局域网地址 $lanUrl。" -ForegroundColor Yellow
}

if ($ours -and $Restart) {
  Write-Host "正在重启课序服务……" -ForegroundColor Cyan
  foreach ($entry in ($listeners | Where-Object { $_.IsOurs })) {
    Stop-Process -Id $entry.Process.ProcessId -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Milliseconds 900
  $ours = $null
}

if ($ours) {
  if (-not (Test-StudioHealth -BaseUrl $healthBase)) {
    Write-Host "课序进程存在但接口没有响应，请查看 $root\data\server.stderr.log" -ForegroundColor Red
    exit 1
  }
  Write-Host "课序服务已经在运行。" -ForegroundColor Green
  Write-Host "本机访问：  http://127.0.0.1:$Port"
  Write-Host "局域网访问：$lanUrl"
  if ($httpsUrl) { Write-Host "HTTPS 录音：$httpsUrl" }
  if (-not $NoBrowser) { Start-Process $healthBase }
  exit 0
}

$dataDir = Join-Path $root 'data'
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
$stdoutLog = Join-Path $dataDir 'server.stdout.log'
$stderrLog = Join-Path $dataDir 'server.stderr.log'

$env:HOST = '0.0.0.0'
$env:PORT = "$Port"
$env:HTTPS_PORT = "$HttpsPort"

$npm = (Get-Command npm.cmd -ErrorAction Stop).Source
$process = Start-Process `
  -FilePath $npm `
  -ArgumentList @('start') `
  -WorkingDirectory $root `
  -WindowStyle Hidden `
  -RedirectStandardOutput $stdoutLog `
  -RedirectStandardError $stderrLog `
  -PassThru

$process.Id | Set-Content -Path (Join-Path $dataDir 'server.pid') -Encoding ascii

$ready = $false
for ($attempt = 0; $attempt -lt 60; $attempt++) {
  Start-Sleep -Milliseconds 500
  if (Test-StudioHealth -BaseUrl $healthBase) {
    $ready = $true
    break
  }
  if ($process.HasExited) { break }
}

if (-not $ready) {
  Write-Host "服务未能启动，请查看日志：" -ForegroundColor Red
  Write-Host "  $stdoutLog"
  Write-Host "  $stderrLog"
  exit 1
}

Write-Host ""
Write-Host "课序已启动，监听 0.0.0.0:$Port" -ForegroundColor Green
Write-Host "本机访问：  http://127.0.0.1:$Port"
Write-Host "局域网访问：$lanUrl" -ForegroundColor Cyan
if ($httpsUrl) {
  Write-Host "HTTPS 录音：$httpsUrl（局域网录音需要先在客户端信任本地 CA）"
}
Write-Host ""
Write-Host "仅限可信局域网使用。系统当前没有登录认证，请勿做端口映射或暴露到公网。" -ForegroundColor Yellow
Write-Host "停止服务：powershell -ExecutionPolicy Bypass -File scripts\stop-lan.ps1"

if (-not $NoBrowser) { Start-Process $healthBase }