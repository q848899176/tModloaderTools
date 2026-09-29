$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$toolsDir = Join-Path $PSScriptRoot '.tools'
New-Item -ItemType Directory -Force $toolsDir | Out-Null
Write-Host '正在从 Node.js 官方下载 Windows 便携环境…'
$release = (Invoke-RestMethod 'https://nodejs.org/dist/index.json' | Where-Object { $_.version -like 'v24.*' -and $_.lts } | Select-Object -First 1).version
if (-not $release) { throw '无法获取 Node.js 24 LTS 版本。' }
$archiveName = "node-$release-win-x64.zip"
$archivePath = Join-Path $toolsDir $archiveName
Invoke-WebRequest "https://nodejs.org/dist/$release/$archiveName" -OutFile $archivePath
$checksums = (Invoke-WebRequest "https://nodejs.org/dist/$release/SHASUMS256.txt").Content
$expectedHash = (($checksums -split "`n" | Where-Object { $_.Trim().EndsWith($archiveName) }) -split '\s+')[0]
if ((Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash -ne $expectedHash) { throw 'Node.js 下载校验失败。' }
Expand-Archive -LiteralPath $archivePath -DestinationPath $toolsDir -Force
$runtimeDir = Join-Path $toolsDir "node-$release-win-x64"
Copy-Item -LiteralPath (Join-Path $runtimeDir 'node.exe') -Destination (Join-Path $toolsDir 'node.exe') -Force
$env:PATH = "$runtimeDir;$env:PATH"
& (Join-Path $runtimeDir 'npm.cmd') install
if ($LASTEXITCODE -ne 0) { throw '依赖安装失败。' }
& (Join-Path $runtimeDir 'npm.cmd') run build
if ($LASTEXITCODE -ne 0) { throw '页面构建失败。' }
$steamDir = Join-Path $toolsDir 'steamcmd'
New-Item -ItemType Directory -Force $steamDir | Out-Null
if (-not (Test-Path -LiteralPath (Join-Path $steamDir 'steamcmd.exe'))) {
  Invoke-WebRequest 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip' -OutFile (Join-Path $toolsDir 'steamcmd.zip')
  Expand-Archive -LiteralPath (Join-Path $toolsDir 'steamcmd.zip') -DestinationPath $steamDir -Force
}
Write-Host '环境已准备好。双击 启动工具.cmd。' -ForegroundColor Green
