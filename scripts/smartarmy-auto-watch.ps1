param(
  [int]$Seconds = 5
)

$ErrorActionPreference = "Stop"

$root = "D:\1. myapps\smartwork-agent"
Set-Location $root

New-Item -ItemType Directory -Force -Path "intake\army-requests","intake\army-requests\processed","reports" | Out-Null

Write-Host "SMARTARMY AUTO WATCH START"
Write-Host "Watching: intake\army-requests"
Write-Host "Drop .txt request files there. Ctrl+C to stop."

while ($true) {
  $files = Get-ChildItem "intake\army-requests" -Filter "*.txt" -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime

  foreach ($f in $files) {
    Write-Host "`n=== PROCESS ARMY REQUEST: $($f.Name) ==="

    $task = Get-Content $f.FullName -Raw

    node "scripts\smartarmy-auto-loop.mjs" auto $task --clip

    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $dest = Join-Path "intake\army-requests\processed" "$stamp-$($f.Name)"
    Move-Item $f.FullName $dest -Force

    Write-Host "Moved to: $dest"
  }

  Start-Sleep -Seconds $Seconds
}