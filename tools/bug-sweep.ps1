$ErrorActionPreference = 'Continue'
$repoRoot = Split-Path $PSScriptRoot -Parent
Set-Location (Join-Path $repoRoot 'game-server')

# 1) 全量语法 lint
$files = Get-ChildItem app,database,tests -Recurse -Filter *.php -File
$bad = @()
foreach ($f in $files) {
  $out = php -l $f.FullName 2>&1 | Out-String
  if ($out -notmatch 'No syntax errors') { $bad += "$($f.FullName): $out" }
}
Write-Host ("1. lint: " + $files.Count + " files, errors: " + $bad.Count)
$bad | ForEach-Object { Write-Host $_ }

# 2) 可疑模式（自有代码，排除 vendor）
Write-Host "2. suspicious patterns:"
$hits = Get-ChildItem app -Recurse -Filter *.php -File | Select-String -Pattern 'TODO|FIXME|HACK|XXX|var_dump\(|dd\(|console\.'
if ($hits) { $hits | ForEach-Object { '{0}:{1}: {2}' -f (Split-Path $_.Path -Leaf), $_.LineNumber, $_.Line.Trim() } } else { Write-Host '  none' }

# 3) web 侧 console.log（构建应剔除，但源码里过多会留噪音）
Set-Location (Join-Path $repoRoot 'web')
$wlogs = Get-ChildItem src -Recurse -Include *.ts,*.tsx -File | Select-String -Pattern 'console\.(log|debug)\(' | Where-Object { $_.Filename -notmatch '\.test\.' }
Write-Host ("3. web console.log in src (non-test): " + @($wlogs).Count)
$wlogs | Select-Object -First 8 | ForEach-Object { '{0}:{1}' -f (Split-Path $_.Path -Leaf), $_.LineNumber }
