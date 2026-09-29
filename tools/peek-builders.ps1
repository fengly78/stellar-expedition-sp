$ErrorActionPreference = 'Continue'
$repoRoot = Split-Path $PSScriptRoot -Parent
Set-Location (Join-Path $repoRoot 'web')
Select-String -Path src\game\state.ts -Pattern '^function buildFleetInput|^export function buildFleetInput|^function unitBattleSpec|^export function unitBattleSpec' | ForEach-Object {
  '{0}: {1}' -f $_.LineNumber, $_.Line.Trim().Substring(0, [Math]::Min(90, $_.Line.Trim().Length))
}
