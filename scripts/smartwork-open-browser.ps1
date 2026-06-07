$root = "D:\1. myapps\smartwork-agent"
$profile = "$root\.smartwork-browser"
$url = $env:SMARTWORK_URL
if (!$url) { $url = "http://localhost:5173" }

$browserChoice = $env:SMARTWORK_BROWSER
if (!$browserChoice) { $browserChoice = "edge" }

$chrome = "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"
$chrome86 = "$env:ProgramFiles(x86)\Google\Chrome\Application\chrome.exe"
$edge64 = "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
$edge = "$env:ProgramFiles(x86)\Microsoft\Edge\Application\msedge.exe"

$debugAlive = $false
try {
  $r = Invoke-WebRequest "http://127.0.0.1:9222/json/version" -UseBasicParsing -TimeoutSec 2
  if ($r.StatusCode -eq 200) { $debugAlive = $true }
} catch {
  $debugAlive = $false
}

if ($debugAlive) {
  Write-Host "SMARTWORK_BROWSER=ALREADY_OPEN"
  exit 0
}

function Open-Browser {
  param(
    [string]$ExePath,
    [string]$Name
  )

  if (Test-Path $ExePath) {
    Write-Host "Opening $Name..."
    Start-Process $ExePath "--remote-debugging-port=9222 --user-data-dir=`"$profile`" --no-first-run --no-default-browser-check $url"
    Start-Sleep -Seconds 4
    Write-Host "SMARTWORK_BROWSER=OPENED_$Name"
    exit 0
  }
}

if ($browserChoice -eq "edge") {
  Open-Browser $edge64 "EDGE"
  Open-Browser $edge "EDGE"
  Open-Browser $chrome "CHROME"
  Open-Browser $chrome86 "CHROME"
} else {
  Open-Browser $chrome "CHROME"
  Open-Browser $chrome86 "CHROME"
  Open-Browser $edge64 "EDGE"
  Open-Browser $edge "EDGE"
}

throw "Chrome/Edge tidak ditemukan."