param(
  [string]$Label = "manual-action",
  [switch]$Strict
)

Set-Location "D:\1. myapps\smartwork-agent"

if ($Strict) {
  node scripts\smartwork-auto-brain-guard.mjs --strict "--label=$Label"
} else {
  node scripts\smartwork-auto-brain-guard.mjs "--label=$Label"
}
