$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$nodePath = Join-Path $projectRoot '.tools\node.exe'
if (-not (Test-Path -LiteralPath $nodePath)) { throw '缺少 Node.js，请先运行 安装环境.ps1。' }
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'dist\index.html'))) { throw '缺少页面构建，请先运行 安装环境.ps1。' }
$webPort = 3000
$settingsPath = Join-Path $projectRoot 'data\settings.json'
if (Test-Path -LiteralPath $settingsPath) { $webPort = (Get-Content -LiteralPath $settingsPath -Raw -Encoding UTF8 | ConvertFrom-Json).webPort }
$url = "http://localhost:$webPort"
try {
  $state = Invoke-RestMethod -Uri "$url/api/health" -TimeoutSec 2
  if ($state.app -eq 'tmodloader-tools') { Start-Process $url; exit 0 }
} catch {}
New-Item -ItemType Directory -Force (Join-Path $projectRoot 'data') | Out-Null
$serverPath = Join-Path $projectRoot 'server\index.ts'
$env:TZ = 'Asia/Shanghai'
$service = Start-Process -FilePath $nodePath -ArgumentList ('"' + $serverPath + '"') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $projectRoot 'data\launcher.log') -RedirectStandardError (Join-Path $projectRoot 'data\launcher-error.log')
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  Start-Sleep -Milliseconds 500
  if ($service.HasExited) { throw ('启动失败，请查看 data\launcher-error.log。' + (Get-Content (Join-Path $projectRoot 'data\launcher-error.log') -Raw)) }
  try { $health = Invoke-RestMethod -Uri "$url/api/health" -TimeoutSec 1; if ($health.app -eq 'tmodloader-tools') { Start-Process $url; exit 0 } } catch {}
}
throw '启动超时，请查看 data 目录中的日志。'
