$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$output = Join-Path $root 'release'

if (-not (Test-Path -LiteralPath $output)) { exit 0 }

Get-ChildItem -LiteralPath $output -Force -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
  if ($_.Attributes -band [IO.FileAttributes]::ReadOnly) {
    try { $_.Attributes = $_.Attributes -band (-bnot [IO.FileAttributes]::ReadOnly) } catch { }
  }
}
$item = Get-Item -LiteralPath $output -Force
if ($item.Attributes -band [IO.FileAttributes]::ReadOnly) {
  $item.Attributes = $item.Attributes -band (-bnot [IO.FileAttributes]::ReadOnly)
}
try { Remove-Item -LiteralPath $output -Recurse -Force -ErrorAction Stop }
catch { throw "Could not remove release output. Close any running desktop app or process using release files. $($_.Exception.Message)" }
