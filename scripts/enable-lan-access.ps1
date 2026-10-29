[CmdletBinding()]
param(
  [int[]]$Port = @(8787, 8788),
  [string]$RemoteAddress = 'LocalSubnet'
)

$ErrorActionPreference = 'Stop'
$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Run this script from an elevated PowerShell window.'
}

$portLabel = $Port -join ','
$displayName = "KEXU Agent Micro Course Studio (LAN $portLabel)"
$existingRules = Get-NetFirewallRule -ErrorAction SilentlyContinue |
  Where-Object { $_.DisplayName -like 'KEXU Agent Micro Course Studio (LAN *' }
$existingRules | Remove-NetFirewallRule -ErrorAction SilentlyContinue

New-NetFirewallRule `
  -DisplayName $displayName `
  -Direction Inbound `
  -Action Allow `
  -Protocol TCP `
  -LocalPort $Port `
  -RemoteAddress $RemoteAddress `
  -Profile Any `
  -Description 'Allow KEXU course studio from the local subnet only' | Out-Null

Write-Host "Firewall rule created: $displayName"
Write-Host "Allowed source: $RemoteAddress"
Write-Host "Ports: TCP $portLabel"
