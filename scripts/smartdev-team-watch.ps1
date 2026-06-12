param(
  [int]$Seconds = 5
)

$ErrorActionPreference = "Continue"

$root = "D:\1. myapps\smartwork-agent"
Set-Location $root

New-Item -ItemType Directory -Force -Path "intake\dev-requests","intake\dev-requests\processed","reports" | Out-Null

Write-Host "`n=== SMARTDEV TEAM WATCHER ACTIVE ==="
Write-Host "Drop .txt request files into: intake\dev-requests"
Write-Host "Press Ctrl+C to stop."

while ($true) {
  $files = Get-ChildItem "intake\dev-requests" -Filter "*.txt" -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime

  foreach ($file in $files) {
    try {
      Write-Host "`n=== PROCESS DEV REQUEST: $($file.Name) ==="
      $text = Get-Content $file.FullName -Raw

      node "scripts\smartdev-team-agent.mjs" auto $text --clip

      $dest = Join-Path "intake\dev-requests\processed" ("{0}-{1}" -f (Get-Date -Format "yyyyMMdd-HHmmss"), $file.Name)
      Move-Item $file.FullName $dest -Force

      Write-Host "Processed -> $dest"
      Write-Host "Mission -> reports\smartdev-team-last.md"
    } catch {
      Write-Host "Watcher error: $($_.Exception.Message)"
    }
  }

  Start-Sleep -Seconds $Seconds
}