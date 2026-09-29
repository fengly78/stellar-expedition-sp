$ErrorActionPreference = 'Continue'

# 2026-09-29：原先这里硬编码了维护者本机的 php 绝对路径与项目根绝对路径。
# 两者都既泄露本机布局、又让脚本在别的机器上直接不可用。改为运行时探测。
$repoRoot = Split-Path -Parent $PSScriptRoot

# 找 php：先看 PATH，再退到常见的用户级安装位置（用 $HOME 而不是硬编码用户名）
if (-not (Get-Command php -ErrorAction SilentlyContinue)) {
    $candidates = @(
        (Join-Path $HOME 'AppData\Local\Programs\php'),
        (Join-Path $HOME 'scoop\shims'),
        '/usr/local/bin',
        '/opt/homebrew/bin'
    ) | Where-Object { Test-Path $_ }
    foreach ($c in $candidates) { $env:PATH = "$c;$env:PATH" }
}

if (-not (Get-Command php -ErrorAction SilentlyContinue)) {
    Write-Output 'SKIP  未找到 php 可执行文件（装 PHP 后重跑，或直接用 vendor\bin\phpunit.bat）'
    exit 0
}

Set-Location (Join-Path $repoRoot 'game-server')
php -d memory_limit=512M vendor\phpunit\phpunit\phpunit 2>&1 |
  Out-File -FilePath "$env:TEMP\pu.log" -Encoding utf8
Select-String -Path "$env:TEMP\pu.log" -Pattern '^\d+\) Tests' | ForEach-Object { $_.Line.Trim() }
Get-Content "$env:TEMP\pu.log" -Tail 5
