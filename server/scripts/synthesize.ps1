param([string]$InputFile)

$ErrorActionPreference = 'Stop'
$job = Get-Content -LiteralPath $InputFile -Raw -Encoding UTF8 | ConvertFrom-Json

Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
if ($job.voice) {
  try { $synth.SelectVoice($job.voice) } catch { }
}
$synth.Rate = [int]$job.rate
$synth.Volume = 100

foreach ($segment in $job.segments) {
  $directory = Split-Path -Parent $segment.output
  if (-not (Test-Path -LiteralPath $directory)) {
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
  }
  $synth.SetOutputToWaveFile($segment.output)
  $synth.Speak($segment.text)
  $synth.SetOutputToNull()
}

$synth.Dispose()
Write-Output 'OK'
