import File from '@lucide/svelte/icons/file';
import FileArchive from '@lucide/svelte/icons/file-archive';
import FileCode from '@lucide/svelte/icons/file-code';
import FileKey from '@lucide/svelte/icons/file-key';
import Package from '@lucide/svelte/icons/package';
import type { LucideIcon } from '@lucide/svelte';

const checksumNames = /(?:^|[._-])(?:sha(?:256|512)sums?|checksums?)(?:\.txt)?$|\.(?:sha256|sha512)$/i;

export function isChecksumFile(name: string) {
  return checksumNames.test(name);
}

export function assetIcon(name: string): LucideIcon {
  const lower = name.toLowerCase();
  if (isChecksumFile(lower) || /\.(?:sig|asc|pem|minisig)$/.test(lower)) return FileKey;
  if (/\.(?:zip|tar|gz|tgz|xz|zst|bz2|7z|rar)$/.test(lower)) return FileArchive;
  if (/\.(?:exe|msi|dmg|pkg|deb|rpm|apk|appimage|flatpak|snap|vsix|whl|jar)$/.test(lower)) return Package;
  if (/\.(?:js|mjs|wasm|json|ya?ml|toml|sh|ps1)$/.test(lower)) return FileCode;
  return File;
}

export function parseChecksums(text: string) {
  const sums = new Map<string, string>();
  for (const line of text.split('\n')) {
    const match = /^([0-9a-f]{64}|[0-9a-f]{128})\s+\*?(.+?)\s*$/i.exec(line.trim());
    if (match) sums.set(match[2].split('/').pop()!, match[1].toLowerCase());
  }
  return sums;
}
