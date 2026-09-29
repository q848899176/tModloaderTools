# 以管理员身份运行，仅对专用网络/域网络中的本地子网开放。
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$webPort = 3000; $gamePort = 7777
$settingsPath = Join-Path $root 'data\settings.json'
if (Test-Path -LiteralPath $settingsPath) { $settings = Get-Content -LiteralPath $settingsPath -Raw -Encoding UTF8 | ConvertFrom-Json; $webPort = $settings.webPort; $gamePort = $settings.port }
$gamePorts = @($gamePort)
$instancesPath = Join-Path $root 'data\instances.json'
if (Test-Path -LiteralPath $instancesPath) { $gamePorts = @((Get-Content -LiteralPath $instancesPath -Raw -Encoding UTF8 | ConvertFrom-Json) | ForEach-Object { $_.port } | Sort-Object -Unique) }
foreach ($entry in @(@{Name='tModLoader Tools Web';Port=$webPort},@{Name='tModLoader Tools Game';Port=$gamePorts})) {
  $rule = Get-NetFirewallRule -DisplayName $entry.Name -ErrorAction SilentlyContinue
  if ($rule) { $rule | Get-NetFirewallPortFilter | Set-NetFirewallPortFilter -Protocol TCP -LocalPort $entry.Port }
  else { New-NetFirewallRule -DisplayName $entry.Name -Direction Inbound -Action Allow -Protocol TCP -LocalPort $entry.Port -Profile Private,Domain -RemoteAddress LocalSubnet | Out-Null }
}
Write-Host '已允许局域网访问管理网页和游戏端口。'
