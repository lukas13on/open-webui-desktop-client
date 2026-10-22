param(
  [string]$PythonVersion = '3.11.9',
  [string]$Architecture = 'amd64'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$lib = Join-Path $root 'lib'
$pythonHome = Join-Path $lib 'python'
$backend = Join-Path $root 'backend'
$archive = Join-Path $env:TEMP "python-$PythonVersion-embed-$Architecture.zip"
$uri = "https://www.python.org/ftp/python/$PythonVersion/python-$PythonVersion-embed-$Architecture.zip"
try { $ProgressPreference = 'SilentlyContinue'; [version]$PythonVersion | Out-Null } catch { throw 'PythonVersion must be a stable numeric version, for example 3.11.9.' }
if ($Architecture -ne 'amd64') { throw 'The packaged desktop currently supports the Windows x64 (amd64) Python runtime only.' }

New-Item -ItemType Directory -Force $lib | Out-Null
Invoke-WebRequest -Uri $uri -OutFile $archive
if (Test-Path $pythonHome) { Remove-Item -Path $pythonHome -Recurse -Force }
New-Item -ItemType Directory -Force $pythonHome | Out-Null
if (Test-Path -LiteralPath $env:TEMP) { Remove-Item -LiteralPath (Join-Path $env:TEMP 'python-stdlib-extract') -Recurse -Force -ErrorAction SilentlyContinue }
Expand-Archive -Path $archive -DestinationPath $pythonHome -Force
New-Item -ItemType Directory -Force (Join-Path $pythonHome 'Lib\site-packages') | Out-Null
Remove-Item -Path $archive -Force

$pth = Get-ChildItem $pythonHome -Filter 'python*._pth' | Select-Object -First 1
if (-not $pth) { throw 'Python embeddable ._pth file was not found.' }
$lines = Get-Content $pth.FullName | Where-Object { $_ -notmatch '^#import site' -and $_ -notmatch '^import site$' -and $_ -notmatch '^Lib\\site-packages$' -and $_ -notmatch '^\.\.' }
$lines += @('Lib\site-packages', '..\..\backend\backend', 'import site')
$lines = $lines | Select-Object -Unique
Set-Content -Path $pth.FullName -Value $lines -Encoding ascii
New-Item -ItemType Directory -Force (Join-Path $pythonHome 'Lib\site-packages') | Out-Null

$installer = Join-Path $env:TEMP 'get-pip.py'
Invoke-WebRequest -Uri 'https://bootstrap.pypa.io/get-pip.py' -OutFile $installer
$stdlibArchive = Join-Path $env:TEMP 'python-stdlib.nupkg'
$stdlibZip = Join-Path $env:TEMP 'python-stdlib.zip'
$stdlibUrl = "https://www.nuget.org/api/v2/package/python/$PythonVersion"
Invoke-WebRequest -Uri $stdlibUrl -OutFile $stdlibArchive
Copy-Item -LiteralPath $stdlibArchive -Destination $stdlibZip -Force
$stdlibExtract = Join-Path $env:TEMP 'python-stdlib-extract'
if (Test-Path $stdlibExtract) { Remove-Item $stdlibExtract -Recurse -Force }
New-Item -ItemType Directory -Force $stdlibExtract | Out-Null
Expand-Archive -Path $stdlibZip -DestinationPath $stdlibExtract -Force
$stdlibRoot = Get-ChildItem -Path $stdlibExtract -Directory -Recurse | Where-Object { $_.Name -eq 'Lib' } | Select-Object -First 1
if (-not $stdlibRoot) { throw 'Python embeddable standard library archive layout was not recognized.' }
$stdlibBase = $stdlibRoot.Parent.FullName
$pipSource = Join-Path $stdlibRoot.FullName 'site-packages\pip'
if (-not (Test-Path -LiteralPath $pipSource)) { throw 'Python NuGet archive does not include pip.' }
Copy-Item -Path $stdlibRoot.FullName -Destination $pythonHome -Recurse -Force
$dllRoot = Join-Path $stdlibBase 'DLLs'
if (Test-Path $dllRoot) { Copy-Item -Path $dllRoot -Destination $pythonHome -Recurse -Force }
$pipSource = Join-Path $stdlibRoot.FullName 'site-packages\pip'
if (-not (Test-Path -LiteralPath $pipSource)) { throw 'Python NuGet archive does not include pip.' }
$pipDestination = Join-Path $pythonHome 'Lib\site-packages\pip'
if (Test-Path -LiteralPath $pipDestination) { Remove-Item -LiteralPath $pipDestination -Recurse -Force }
Copy-Item -LiteralPath $pipSource -Destination (Join-Path $pythonHome 'Lib\site-packages') -Recurse -Force
$sitePackagesPath = Join-Path $pythonHome 'Lib\site-packages'
Remove-Item -Path $stdlibArchive, $stdlibZip -Force
Remove-Item -Path $stdlibExtract -Recurse -Force
& (Join-Path $pythonHome 'python.exe') $installer --no-warn-script-location --target $sitePackagesPath
$installerExitCode = $LASTEXITCODE
if ($installerExitCode -ne 0) { throw "Could not bootstrap pip in the embedded Python environment (exit code $installerExitCode)." }
& (Join-Path $pythonHome 'python.exe') -m pip install --disable-pip-version-check --only-binary=:all: --no-compile -r (Join-Path $backend 'backend\requirements-slim.txt')
$installExitCode = $LASTEXITCODE
if ($installExitCode -ne 0) { throw "Could not install Open Web UI backend requirements (exit code $installExitCode). Check the pip output above." }
$previousSecret = $env:WEBUI_SECRET_KEY
$previousJwtSecret = $env:WEBUI_JWT_SECRET_KEY
$previousWebUiAuth = $env:WEBUI_AUTH
$previousUseSlim = $env:USE_SLIM_DOCKER
$previousDataDir = $env:DATA_DIR
$tempDataDir = Join-Path $env:TEMP 'openwebui-desktop-import-check'
try {
  $env:WEBUI_SECRET_KEY = 'desktop-import-check-only-not-for-use'
  $env:WEBUI_JWT_SECRET_KEY = 'desktop-import-check-only-not-for-use'
  $env:WEBUI_AUTH = 'True'
  $env:USE_SLIM_DOCKER = 'true'
  $env:DATA_DIR = $tempDataDir
  & (Join-Path $pythonHome 'python.exe') -c "import pip, uvicorn, fastapi, open_webui.main; print('Backend import check passed.')"
  $importExitCode = $LASTEXITCODE
} finally {
  $env:WEBUI_SECRET_KEY = $previousSecret
  $env:WEBUI_JWT_SECRET_KEY = $previousJwtSecret
  $env:WEBUI_AUTH = $previousWebUiAuth
  $env:USE_SLIM_DOCKER = $previousUseSlim
  $env:DATA_DIR = $previousDataDir
  if (Test-Path -LiteralPath $tempDataDir) { Remove-Item -LiteralPath $tempDataDir -Recurse -Force -ErrorAction SilentlyContinue }
}
if ($importExitCode -ne 0) { throw 'The Python backend dependency import check failed. See the error above.' }
Remove-Item -Path $installer -Force -ErrorAction SilentlyContinue
Write-Host "Embedded Python $PythonVersion and backend requirements installed under lib/python."
