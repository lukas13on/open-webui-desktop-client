$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$gitDirectory = Join-Path $root 'backend\.git'
if (-not (Test-Path -LiteralPath $gitDirectory)) { throw 'The server Git metadata is missing from backend\.git.' }

Get-ChildItem -LiteralPath $gitDirectory -Force -Recurse -File | ForEach-Object {
  if ($_.Attributes -band [IO.FileAttributes]::ReadOnly) {
    $_.Attributes = $_.Attributes -band (-bnot [IO.FileAttributes]::ReadOnly)
  }
}
