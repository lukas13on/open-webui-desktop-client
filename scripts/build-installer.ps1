param([ValidateSet('nsis', 'appx')][string]$Target = 'nsis')
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$python = Join-Path $root 'lib\python\python.exe'
if (-not (Test-Path $python)) { throw 'Run scripts\prepare-python.ps1 before packaging.' }
if (-not (Test-Path (Join-Path $root 'backend\backend\open_webui\main.py'))) { throw 'The server fork is missing from backend/backend.' }
if ($Target -eq 'appx' -and $env:APPX_PUBLISHER -and $env:APPX_PUBLISHER -ne 'CN=OpenWebUIDesktop') { throw 'Set the verified publisher in package.json before building the Microsoft Store package.' }
Push-Location $root
try {
  npm run "package:$(if ($Target -eq 'appx') { 'msix' } else { 'win' })"
  if ($LASTEXITCODE -ne 0) { throw 'Desktop package build failed.' }
} finally { Pop-Location }
