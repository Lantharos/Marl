param(
    [string]$PigBin = "E:\Desktop\pig\target\debug\pig.exe",
    [string]$StyBin = "",
    [string]$WranglerBin = "",
    [string]$RemoteUrl = "http://127.0.0.1:8787"
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$workerDir = Join-Path $repoRoot "server\worker"

if ($StyBin -eq "") {
    Push-Location $repoRoot
    try {
        cargo build | Out-Host
        $StyBin = Join-Path $repoRoot "target\debug\sty.exe"
    } finally {
        Pop-Location
    }
}

if ($WranglerBin -eq "") {
    $WranglerBin = Join-Path $repoRoot "frontend\node_modules\.bin\wrangler.exe"
}

$root = Join-Path ([System.IO.Path]::GetTempPath()) ("sty-worker-smoke-" + [System.Guid]::NewGuid().ToString("N"))
$homeDir = Join-Path $root "home"
$repoA = Join-Path $root "repo-a"
$repoB = Join-Path $root "repo-b"
$workerOut = Join-Path $root "worker.out.log"
$workerErr = Join-Path $root "worker.err.log"
New-Item -ItemType Directory -Path $homeDir, $repoA, $repoB | Out-Null

$devVars = Join-Path $workerDir ".dev.vars"
$hadDevVars = Test-Path -LiteralPath $devVars
$oldDevVars = $null
if ($hadDevVars) {
    $oldDevVars = Get-Content -LiteralPath $devVars -Raw
}

$oldUserProfile = $env:USERPROFILE
$oldHome = $env:HOME
$oldStyConfig = $env:STY_CONFIG
$oldRustupToolchain = $env:RUSTUP_TOOLCHAIN
$env:RUSTUP_TOOLCHAIN = "stable-x86_64-pc-windows-msvc"

Set-Content -LiteralPath $devVars -Value @"
AVE_ISSUER=https://aveid.net
AVE_CLIENT_ID=app_813ac5533bb87d939f328d76b5a1dca8
STY_DEV_TOKENS=true
"@

$worker = Start-Process `
    -FilePath $WranglerBin `
    -ArgumentList @("dev", "--ip", "127.0.0.1", "--port", "8787") `
    -WorkingDirectory $workerDir `
    -RedirectStandardOutput $workerOut `
    -RedirectStandardError $workerErr `
    -WindowStyle Hidden `
    -PassThru

try {
    $ready = $false
    for ($i = 0; $i -lt 90; $i++) {
        Start-Sleep -Milliseconds 1000
        try {
            Invoke-WebRequest -Uri "$RemoteUrl/v1/projects" -UseBasicParsing -TimeoutSec 2 | Out-Null
            $ready = $true
            break
        } catch {
            if ($_.Exception.Response -ne $null) {
                $ready = $true
                break
            }
            if ($worker.HasExited) {
                throw "wrangler dev exited early; see $workerOut and $workerErr"
            }
        }
    }
    if (!$ready) {
        throw "wrangler dev did not become ready; see $workerOut and $workerErr"
    }

    $env:USERPROFILE = $homeDir
    $env:HOME = $homeDir
    $env:STY_CONFIG = Join-Path $homeDir ".sty\config.json"

    $preflight = Invoke-WebRequest `
        -Uri "$RemoteUrl/v1/dev/tokens" `
        -Method Options `
        -Headers @{
            Origin = "http://localhost:5173"
            "Access-Control-Request-Method" = "POST"
            "Access-Control-Request-Headers" = "content-type"
        } `
        -TimeoutSec 10 `
        -UseBasicParsing
    if ($preflight.Headers["Access-Control-Allow-Origin"] -ne "http://localhost:5173") {
        throw "worker CORS preflight did not allow localhost frontend"
    }

    & $StyBin login --dev --remote-url $RemoteUrl --pig $PigBin | Out-Host

    Push-Location $repoA
    try {
        Set-Content -LiteralPath (Join-Path $repoA "hello.txt") -Value "hello from sty worker"
        $large = New-Object byte[] (3 * 1024 * 1024)
        for ($i = 0; $i -lt $large.Length; $i++) {
            $large[$i] = [byte]($i % 251)
        }
        [System.IO.File]::WriteAllBytes((Join-Path $repoA "large.bin"), $large)
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
        if ((Get-Item -LiteralPath (Join-Path $repoB "large.bin")).Length -ne (3 * 1024 * 1024)) {
            throw "second repo did not pull large.bin"
        }
    } finally {
        Pop-Location
    }

    Write-Host "sty/Worker/PIG smoke passed"
} finally {
    if ($worker -and !$worker.HasExited) {
        Stop-Process -Id $worker.Id -Force
    }
    if ($hadDevVars) {
        Set-Content -LiteralPath $devVars -Value $oldDevVars
    } else {
        Remove-Item -LiteralPath $devVars -ErrorAction SilentlyContinue
    }
    $env:USERPROFILE = $oldUserProfile
    $env:HOME = $oldHome
    $env:STY_CONFIG = $oldStyConfig
    $env:RUSTUP_TOOLCHAIN = $oldRustupToolchain
}
