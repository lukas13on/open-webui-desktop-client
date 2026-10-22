param(
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root 'backend'
$buildIndex = Join-Path $backend 'build\index.html'
$nodeModules = Join-Path $backend 'node_modules'

if (-not (Test-Path -LiteralPath (Join-Path $backend 'package.json'))) {
  throw "Server source not found in $backend. Clone the fork into backend before packaging."
}

if ((Test-Path -LiteralPath $buildIndex) -and -not $Force) {
  Write-Host 'Open Web UI frontend already built in backend\build. Use -Force to rebuild.'
  return
}

$previousCypress = $env:CYPRESS_INSTALL_BINARY
$previousNodeOptions = $env:NODE_OPTIONS
Push-Location $backend
try {
  if (-not (Test-Path -LiteralPath $nodeModules) -or $Force) {
    $env:CYPRESS_INSTALL_BINARY = '0'
    Write-Host 'Installing server frontend dependencies...'
    npm ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw "Could not install server dependencies (exit code $LASTEXITCODE)." }
  }
  if (-not $env:NODE_OPTIONS) { $env:NODE_OPTIONS = '--max-old-space-size=8192' }
  # The prebuild hook validates vendored artifacts using POSIX paths and fails on Windows checkouts (CRLF);
  # the artifact ships as-is in the repository, so only the Vite build runs here.
  Write-Host 'Building the Open Web UI frontend (this may take a few minutes)...'
  npm run build --ignore-scripts
  if ($LASTEXITCODE -ne 0) { throw "Could not build the server frontend (exit code $LASTEXITCODE)." }
} finally {
  Pop-Location
  $env:CYPRESS_INSTALL_BINARY = $previousCypress
  $env:NODE_OPTIONS = $previousNodeOptions
}

if (-not (Test-Path -LiteralPath $buildIndex)) {
  throw "Frontend build output was not generated at $buildIndex."
}
Write-Host 'Open Web UI frontend built in backend\build.'
