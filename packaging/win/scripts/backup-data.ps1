param(
  [string]$OutputDirectory
)

$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$data = Join-Path $root 'data'
if (-not (Test-Path -LiteralPath $data)) {
  throw "Data directory not found: $data"
}

if (-not $OutputDirectory) {
  $OutputDirectory = Join-Path $root 'backups'
}
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
if (-not $OutputDirectory.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Backup destination must stay inside the portable directory."
}
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$zipPath = Join-Path $OutputDirectory "kexu-data-$stamp.zip"
$stage = Join-Path $OutputDirectory ".data-backup-$stamp"
$stageData = Join-Path $stage 'data'

$excluded = @(
  'secrets.json',
  'ui-check',
  'shot-test',
  'tts-test',
  'backups'
)

try {
  New-Item -ItemType Directory -Force -Path $stageData | Out-Null
  Get-ChildItem -LiteralPath $data -Force | Where-Object {
    $excluded -notcontains $_.Name
  } | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $stageData -Recurse -Force
  }
  Compress-Archive -LiteralPath $stageData -DestinationPath $zipPath -CompressionLevel Optimal
  $size = [math]::Round((Get-Item -LiteralPath $zipPath).Length / 1MB, 2)
  Write-Host "[OK] Data backup: $zipPath ($size MB)"
} finally {
  $resolvedStage = [IO.Path]::GetFullPath($stage)
  if ($resolvedStage.StartsWith($OutputDirectory, [StringComparison]::OrdinalIgnoreCase) -and
      (Test-Path -LiteralPath $resolvedStage)) {
    Remove-Item -LiteralPath $resolvedStage -Recurse -Force
  }
}
