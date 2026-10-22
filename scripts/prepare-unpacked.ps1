$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$installPath = Join-Path $root 'release\win-unpacked'
$libPython = Join-Path $root 'lib\python\python.exe'

if (-not (Test-Path -LiteralPath $libPython)) {
  throw 'Embedded Python was not found. Run scripts\prepare-python.ps1 before creating the development package.'
}

if (Test-Path -LiteralPath $installPath) {
  $running = Get-CimInstance Win32_Process -Filter "Name = 'Open Web UI Desktop.exe'" -ErrorAction SilentlyContinue
  if ($running) { throw 'Close the running unpacked desktop app before rebuilding package:dev.' }
  Get-ChildItem -LiteralPath $installPath -Force -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_.Attributes -band [IO.FileAttributes]::ReadOnly) {
      try { $_.Attributes = $_.Attributes -band (-bnot [IO.FileAttributes]::ReadOnly) } catch { }
    }
  }
  Remove-Item -LiteralPath $installPath -Recurse -Force -ErrorAction Stop
}
