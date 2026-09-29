param(
    [string]$TmlPath = 'D:\Steam\steamapps\common\tModLoader'
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$source = Join-Path $projectRoot 'server-mod\TerraWebBridge'
$buildSave = Join-Path $projectRoot '.tools\bridge-build-save'
$modPath = Join-Path $buildSave 'Mods'
$dotnet = Join-Path $TmlPath 'dotnet\dotnet.exe'
$assembly = Join-Path $TmlPath 'tModLoader.dll'
if (!(Test-Path -LiteralPath $dotnet) -or !(Test-Path -LiteralPath $assembly)) {
    throw '未找到 tModLoader 或其自带 .NET，请使用 -TmlPath 指定安装目录。'
}
New-Item -ItemType Directory -Force -Path $modPath | Out-Null
$output = Join-Path $modPath 'TerraWebBridge.tmod'
$buildStarted = [DateTime]::Now
Push-Location $TmlPath
try {
    & $dotnet $assembly -server -build $source -tmlsavedirectory $buildSave -modpath $modPath
    if ($LASTEXITCODE -ne 0) { throw "Mod 构建失败，退出码 $LASTEXITCODE" }
} finally {
    Pop-Location
}
if (!(Test-Path -LiteralPath $output) -or (Get-Item -LiteralPath $output).LastWriteTime -lt $buildStarted) {
    throw '未找到本次构建产物，请检查 tModLoader 构建日志。'
}
$destination = Join-Path $projectRoot 'server-mod\TerraWebBridge.tmod'
Copy-Item -LiteralPath $output -Destination $destination -Force
Write-Host "构建成功：$destination"
