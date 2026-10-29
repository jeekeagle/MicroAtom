param(
  [Parameter(Mandatory = $true)][string]$HealthUrl,
  [Parameter(Mandatory = $true)][string]$Url,
  [int]$TimeoutSeconds = 60
)

$ErrorActionPreference = 'SilentlyContinue'
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
while ((Get-Date) -lt $deadline) {
  try {
    $health = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 2
    if ($health.ok) {
      Start-Process $Url
      exit 0
    }
  } catch {
    Start-Sleep -Milliseconds 750
  }
}
exit 1
