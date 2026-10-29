[CmdletBinding()]
param(
  [switch]$Force,
  [switch]$Trust
)

$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$certDir = Join-Path $workspace 'data\certs'
$caKey = Join-Path $certDir 'ca.key'
$caCert = Join-Path $certDir 'ca.crt'
$serverKey = Join-Path $certDir 'server.key'
$serverCert = Join-Path $certDir 'server.crt'

$openssl = (Get-Command openssl.exe -ErrorAction SilentlyContinue).Source
if (-not $openssl) {
  $candidates = @(
    'C:\Program Files\Git\usr\bin\openssl.exe',
    'C:\Program Files\Git\bin\openssl.exe'
  )
  $openssl = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}
if (-not $openssl) {
  throw 'OpenSSL was not found. Install Git for Windows or set KEXU_OPENSSL.'
}

New-Item -ItemType Directory -Force -Path $certDir | Out-Null
if (-not $Force -and (Test-Path $serverCert) -and (Test-Path $serverKey)) {
  Write-Host "Certificate already exists: $serverCert"
  if ($Trust) {
    Import-Certificate -FilePath $caCert -CertStoreLocation Cert:\CurrentUser\Root | Out-Null
    Write-Host "Trusted local CA: $caCert"
  }
  exit 0
}

$ips = @('127.0.0.1') + @(
  Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
      $_.IPAddress -notlike '127.*' -and
      $_.IPAddress -notlike '169.254.*'
    } |
    Select-Object -ExpandProperty IPAddress
)
$ips = @($ips | Select-Object -Unique)
$dnsNames = @('localhost')
if ($env:COMPUTERNAME) { $dnsNames += $env:COMPUTERNAME }

$altNames = New-Object System.Collections.Generic.List[string]
$index = 1
foreach ($ip in $ips) {
  $altNames.Add("IP.$index=$ip")
  $index += 1
}
$index = 1
foreach ($name in ($dnsNames | Select-Object -Unique)) {
  $altNames.Add("DNS.$index=$name")
  $index += 1
}

$extPath = Join-Path $certDir 'server.ext'
$extText = @(
  'basicConstraints=CA:FALSE',
  'keyUsage=critical,digitalSignature,keyEncipherment',
  'extendedKeyUsage=serverAuth',
  'subjectAltName=@alt_names',
  '[alt_names]'
) + $altNames
[IO.File]::WriteAllText($extPath, ($extText -join "`r`n") + "`r`n", [Text.UTF8Encoding]::new($false))

& $openssl req -x509 -newkey rsa:2048 -sha256 -days 3650 -nodes `
  -keyout $caKey -out $caCert `
  -subj '/CN=KEXU Local CA' `
  -addext 'basicConstraints=critical,CA:TRUE' `
  -addext 'keyUsage=critical,keyCertSign,cRLSign'
if ($LASTEXITCODE -ne 0) { throw 'Failed to create the local CA.' }

$csr = Join-Path $certDir 'server.csr'
& $openssl req -newkey rsa:2048 -nodes -keyout $serverKey -out $csr `
  -subj '/CN=KEXU Local Server'
if ($LASTEXITCODE -ne 0) { throw 'Failed to create the server certificate request.' }

& $openssl x509 -req -in $csr -CA $caCert -CAkey $caKey -CAcreateserial `
  -out $serverCert -days 397 -sha256 -extfile $extPath
if ($LASTEXITCODE -ne 0) { throw 'Failed to sign the server certificate.' }

Remove-Item -LiteralPath $csr -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $extPath -Force -ErrorAction SilentlyContinue

if ($Trust) {
  Import-Certificate -FilePath $caCert -CertStoreLocation Cert:\CurrentUser\Root | Out-Null
  Write-Host "Trusted local CA: $caCert"
}

Write-Host "Created server certificate: $serverCert"
Write-Host "Created CA certificate: $caCert"
Write-Host ('Certificate IPs: ' + ($ips -join ', '))
