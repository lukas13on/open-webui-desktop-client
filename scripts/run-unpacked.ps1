$ErrorActionPreference = 'Stop'
$currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$currentPrincipal = [Security.Principal.WindowsPrincipal]::new($currentIdentity)
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  $scriptPath = '"{0}"' -f $PSCommandPath
  $elevated = Start-Process -FilePath 'powershell.exe' -Verb RunAs -Wait -PassThru -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $scriptPath)
  exit $elevated.ExitCode
}

$root = Split-Path -Parent $PSScriptRoot
$installPath = Join-Path $root 'release\win-unpacked'
$executable = Join-Path $installPath 'Open Web UI Desktop.exe'
$resources = Join-Path $installPath 'resources'
$libSource = Join-Path $root 'lib'
$libTarget = Join-Path $resources 'lib'
$backendTarget = Join-Path $resources 'backend'

if (-not (Test-Path -LiteralPath $executable)) { throw "Unpacked executable not found: $executable" }
if (-not (Test-Path -LiteralPath (Join-Path $libSource 'python\python.exe'))) {
  throw 'Embedded Python was not found. Run scripts\prepare-python.ps1 before creating the development package.'
}
$python = Join-Path $libSource 'python\python.exe'
& $python -c "import uvicorn, fastapi; print('Python backend dependencies are available.')"
if ($LASTEXITCODE -ne 0) { throw 'Python backend dependencies are missing. Run scripts\prepare-python.ps1 and confirm dependency installation completes.' }

New-Item -ItemType Directory -Force -Path $resources | Out-Null
$dataDirectory = Join-Path $env:APPDATA 'openwebui-desktop\data'
$dataFile = Join-Path $dataDirectory 'webui.db'
New-Item -ItemType Directory -Force -Path $dataDirectory | Out-Null
if (-not (Test-Path -LiteralPath $dataFile -PathType Leaf)) {
  New-Item -ItemType File -Path $dataFile | Out-Null
}

$robocopy = Join-Path $env:SystemRoot 'System32\robocopy.exe'
if (-not (Test-Path -LiteralPath $robocopy)) { throw "robocopy.exe was not found at $robocopy." }
& $robocopy $libSource $libTarget /MIR /R:2 /W:2 /NFL /NDL /NJH /NJS /NP | Out-Null
$copyExit = $LASTEXITCODE
if ($copyExit -ge 8) { throw "Could not copy the Python runtime to $libTarget (robocopy exit $copyExit)." }

$packagedPython = Join-Path $libTarget 'python\python.exe'
if (-not (Test-Path -LiteralPath $packagedPython)) { throw "The Python runtime was not copied to $packagedPython." }
$requiredModules = @('uvicorn\__init__.py', 'fastapi\__init__.py')
foreach ($module in $requiredModules) {
  $modulePath = Join-Path $libTarget "python\Lib\site-packages\$module"
  if (-not (Test-Path -LiteralPath $modulePath)) { throw "Missing dependency in the package: $modulePath. Run scripts\prepare-python.ps1 again." }
}
$previousSecret = $env:WEBUI_SECRET_KEY
$previousJwtSecret = $env:WEBUI_JWT_SECRET_KEY
$previousWebUiAuth = $env:WEBUI_AUTH
$previousUseSlim = $env:USE_SLIM_DOCKER
$previousDataDir = $env:DATA_DIR
try {
  $env:WEBUI_SECRET_KEY = 'desktop-packaged-runtime-check'
  $env:WEBUI_JWT_SECRET_KEY = 'desktop-packaged-runtime-check'
  $env:WEBUI_AUTH = 'True'
  $env:USE_SLIM_DOCKER = 'true'
  $env:DATA_DIR = $dataDirectory
  & $packagedPython -c "import uvicorn, fastapi, open_webui.main; print('Runtime do pacote validado.')"
  $runtimeExitCode = $LASTEXITCODE
} finally {
  $env:WEBUI_SECRET_KEY = $previousSecret
  $env:WEBUI_JWT_SECRET_KEY = $previousJwtSecret
  $env:WEBUI_AUTH = $previousWebUiAuth
  $env:USE_SLIM_DOCKER = $previousUseSlim
  $env:DATA_DIR = $previousDataDir
}
if ($runtimeExitCode -ne 0) { throw 'The Python runtime copied into the package could not import the server.' }

if (-not (Test-Path -LiteralPath (Join-Path $backendTarget 'build\index.html'))) {
  throw 'Server frontend build is missing from resources\backend\build. Run scripts\prepare-backend.ps1 before packaging.'
}

if (-not (Test-Path -LiteralPath (Join-Path $backendTarget '.git'))) {
  throw 'Packaged server Git metadata is missing from resources\backend.'
}

$env:OPENWEBUI_DESKTOP_PATH = $installPath
Start-Process -FilePath $executable -WorkingDirectory $installPath
