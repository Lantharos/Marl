param(
    [string]$PigBin = "E:\Desktop\pig\target\debug\pig.exe",
    [string]$StyBin = "",
    [string]$ServerBin = "",
    [string]$RemoteUrl = "http://127.0.0.1:7381"
)

$ErrorActionPreference = "Stop"

if ($StyBin -eq "") {
    cargo build | Out-Host
    $StyBin = Join-Path (Get-Location) "target\debug\sty.exe"
    $ServerBin = Join-Path (Get-Location) "target\debug\sty-local-server.exe"
} elseif ($ServerBin -eq "") {
    $ServerBin = Join-Path (Split-Path -Parent $StyBin) "sty-local-server.exe"
}

$root = Join-Path ([System.IO.Path]::GetTempPath()) ("sty-pig-smoke-" + [System.Guid]::NewGuid().ToString("N"))
$homeDir = Join-Path $root "home"
$data = Join-Path $root "data"
$repoA = Join-Path $root "repo-a"
$repoB = Join-Path $root "repo-b"
$serverOut = Join-Path $root "server.out.log"
$serverErr = Join-Path $root "server.err.log"
New-Item -ItemType Directory -Path $homeDir, $data, $repoA, $repoB | Out-Null

$oldUserProfile = $env:USERPROFILE
$oldHome = $env:HOME
$oldStyConfig = $env:STY_CONFIG
$env:USERPROFILE = $homeDir
$env:HOME = $homeDir
$env:STY_CONFIG = Join-Path $homeDir ".sty\config.json"

$server = Start-Process -FilePath $ServerBin -ArgumentList @("--data", $data, "--bind", "127.0.0.1:7381") -RedirectStandardOutput $serverOut -RedirectStandardError $serverErr -WindowStyle Hidden -PassThru

try {
    Start-Sleep -Milliseconds 500
    & $StyBin login --dev --remote-url $RemoteUrl --pig $PigBin | Out-Host

    Push-Location $repoA
    try {
        Set-Content -LiteralPath (Join-Path $repoA "hello.txt") -Value "hello from sty"
        & $PigBin save "initial" | Out-Host
        & $StyBin init dev/demo --remote-url $RemoteUrl --pig $PigBin | Out-Host
        & $PigBin sync --json | Out-Host
    } finally {
        Pop-Location
    }

    Push-Location $repoB
    try {
        & $StyBin init dev/demo --remote-url $RemoteUrl --pig $PigBin | Out-Host
        $pull = & $PigBin sync --json
        $pull | Out-Host
        if (!(Test-Path -LiteralPath (Join-Path $repoB "hello.txt"))) {
            throw "second repo did not pull hello.txt"
        }
    } finally {
        Pop-Location
    }

    Write-Host "sty/PIG smoke passed"
} finally {
    if ($server -and !$server.HasExited) {
        Stop-Process -Id $server.Id -Force
    }
    $env:USERPROFILE = $oldUserProfile
    $env:HOME = $oldHome
    $env:STY_CONFIG = $oldStyConfig
}
