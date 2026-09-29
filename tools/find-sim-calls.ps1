$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
Set-Location (Join-Path $repoRoot 'web')
Get-ChildItem src -Recurse -Include *.ts,*.tsx | Select-String -Pattern "from '\./battle'|from '\.\./game/battle'|from '\.\./\.\./game/battle'|simulate\(" | ForEach-Object {
  '{0}:{1}: {2}' -f (Split-Path $_.Path -Leaf), $_.LineNumber, $_.Line.Trim().Substring(0, [Math]::Min(95, $_.Line.Trim().Length))
}
