export const unixInstallCommand = 'curl -fsSL https://sty.sh/install.sh | sh';
export const windowsInstallCommand = 'irm https://sty.sh/install.ps1 | iex';

const normalizeNewlines = (value: string) => value.replace(/\r\n/g, '\n');

export const shellInstallScript = normalizeNewlines(`#!/usr/bin/env sh
set -eu

say() {
	printf '%s\\n' "$*"
}

fail() {
	say "sty install: $*" >&2
	exit 1
}

need() {
	command -v "$1" >/dev/null 2>&1 || fail "missing required command: $1"
}

case "$(uname -s)" in
	Darwin) os="darwin" ;;
	Linux) os="linux" ;;
	*) fail "unsupported OS: $(uname -s)" ;;
esac

case "$(uname -m)" in
	x86_64 | amd64) arch="x64" ;;
	arm64 | aarch64) arch="arm64" ;;
	*) fail "unsupported architecture: $(uname -m)" ;;
esac

need tar
install_dir="\${STY_INSTALL_DIR:-$HOME/.sty/bin}"
origin="\${STY_INSTALL_ORIGIN:-https://sty.sh}"
archive="sty-$os-$arch.tar.gz"
url="\${STY_DOWNLOAD_URL:-$origin/lantharos/pig/releases/latest/$archive}"
tmp="\${TMPDIR:-/tmp}/sty-install-$$"
components="\${STY_INSTALL_COMPONENTS:-}"

case "$components" in
	"" | both | pig) ;;
	*) fail "STY_INSTALL_COMPONENTS must be 'both' or 'pig'" ;;
esac

if [ -z "$components" ]; then
	if [ -r /dev/tty ] && [ -w /dev/tty ]; then
		printf '%s' "Install both sty and pig? [Y/n] " >/dev/tty
		IFS= read -r answer </dev/tty || answer=""
		case "$answer" in
			n | N | no | No | NO) components="pig" ;;
			*) components="both" ;;
		esac
	else
		components="both"
	fi
fi

mkdir -p "$tmp" "$install_dir"
trap 'rm -rf "$tmp"' EXIT INT TERM

say "sty install: downloading $url"
if command -v curl >/dev/null 2>&1; then
	curl -fsSL "$url" -o "$tmp/$archive" || fail "download failed"
elif command -v wget >/dev/null 2>&1; then
	wget -qO "$tmp/$archive" "$url" || fail "download failed"
else
	fail "missing curl or wget"
fi

tar -xzf "$tmp/$archive" -C "$tmp" || fail "archive extraction failed"

install_one() {
	name="$1"
	src="$(find "$tmp" -type f -name "$name" -perm -u+x | head -n 1 || true)"
	if [ -z "$src" ]; then
		src="$(find "$tmp" -type f -name "$name" | head -n 1 || true)"
	fi
	if [ -z "$src" ]; then
		fail "archive did not contain $name"
	fi
	cp "$src" "$install_dir/$name"
	chmod +x "$install_dir/$name"
}

install_one pig
if [ "$components" = "both" ]; then
	install_one sty
fi

if [ "$components" = "both" ]; then
	say "sty install: installed sty and pig to $install_dir"
else
	say "sty install: installed pig to $install_dir"
fi
case ":$PATH:" in
	*":$install_dir:"*) ;;
	*) say "sty install: add $install_dir to your PATH" ;;
esac
if [ "$components" = "both" ]; then
	say "sty install: run sty login"
else
	say "sty install: run pig --help"
fi
`);

export const powershellInstallScript = normalizeNewlines(String.raw`$ErrorActionPreference = "Stop"

function Stop-StyInstall($Message) {
	throw "sty install: $Message"
}

$InstallDir = if ($env:STY_INSTALL_DIR) { $env:STY_INSTALL_DIR } else { Join-Path $env:USERPROFILE ".sty\bin" }
$Origin = if ($env:STY_INSTALL_ORIGIN) { $env:STY_INSTALL_ORIGIN.TrimEnd("/") } else { "https://sty.sh" }
$Components = if ($env:STY_INSTALL_COMPONENTS) { $env:STY_INSTALL_COMPONENTS.ToLowerInvariant() } else { "" }
$ArchName = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()

if ($Components -and $Components -notin @("both", "pig")) {
	Stop-StyInstall "STY_INSTALL_COMPONENTS must be 'both' or 'pig'"
}

if (-not $Components) {
	try {
		$Answer = Read-Host "Install both sty and pig? [Y/n]"
	} catch {
		$Answer = ""
	}
	if ($Answer -match "^(n|no)$") {
		$Components = "pig"
	} else {
		$Components = "both"
	}
}

switch ($ArchName) {
	"x64" { $Arch = "x64" }
	"arm64" { $Arch = "arm64" }
	default { Stop-StyInstall "unsupported architecture: $ArchName" }
}

$Archive = "sty-windows-$Arch.zip"
$Url = if ($env:STY_DOWNLOAD_URL) { $env:STY_DOWNLOAD_URL } else { "$Origin/lantharos/pig/releases/latest/$Archive" }
$TempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("sty-install-" + [System.Guid]::NewGuid().ToString("n"))
$ZipPath = Join-Path $TempRoot $Archive
$ExtractDir = Join-Path $TempRoot "extract"

New-Item -ItemType Directory -Force -Path $InstallDir, $ExtractDir | Out-Null

try {
	Write-Host "sty install: downloading $Url"
	Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $ZipPath
	Expand-Archive -LiteralPath $ZipPath -DestinationPath $ExtractDir -Force

	$Names = @("pig.exe")
	if ($Components -eq "both") {
		$Names = @("sty.exe", "pig.exe")
	}

	foreach ($Name in $Names) {
		$Binary = Get-ChildItem -LiteralPath $ExtractDir -Recurse -File -Filter $Name | Select-Object -First 1
		if (-not $Binary) {
			Stop-StyInstall "archive did not contain $Name"
		}
		Copy-Item -LiteralPath $Binary.FullName -Destination (Join-Path $InstallDir $Name) -Force
	}

	$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
	$PathItems = @()
	if ($UserPath) {
		$PathItems = $UserPath -split ";" | Where-Object { $_ }
	}
	$AlreadyOnPath = $PathItems | Where-Object { $_.TrimEnd("\") -ieq $InstallDir.TrimEnd("\") }
	if (-not $AlreadyOnPath) {
		$PathItems += $InstallDir
		[Environment]::SetEnvironmentVariable("Path", ($PathItems -join ";"), "User")
		$env:Path = "$env:Path;$InstallDir"
		Write-Host "sty install: added $InstallDir to your user PATH"
	}

	if ($Components -eq "both") {
		Write-Host "sty install: installed sty and pig to $InstallDir"
		Write-Host "sty install: run sty login"
	} else {
		Write-Host "sty install: installed pig to $InstallDir"
		Write-Host "sty install: run pig --help"
	}
} finally {
	if (Test-Path -LiteralPath $TempRoot) {
		Remove-Item -LiteralPath $TempRoot -Recurse -Force
	}
}
`);
