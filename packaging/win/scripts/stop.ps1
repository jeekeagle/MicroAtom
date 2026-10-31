[CmdletBinding()]
param([int]$Port = 8787)

$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$owners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique
$stopped = @()

foreach ($ownerPid in $owners) {
  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $ownerPid" -ErrorAction SilentlyContinue
  if (-not $process) { continue }
  if ($process.CommandLine -like "*$root*" -or $process.CommandLine -like '*server\index.ts*') {
    Stop-Process -Id $ownerPid -Force -ErrorAction SilentlyContinue
    $stopped += $ownerPid
  }
}

if ($stopped.Count -eq 0) {
  Write-Host "没有找到正在监听 $Port 的课序服务。"
} else {
  Write-Host "已停止课序服务：PID $($stopped -join ', ')"
}