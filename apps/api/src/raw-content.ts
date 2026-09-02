const textExtensions = new Set(['md', 'txt', 'rs', 'ts', 'tsx', 'js', 'jsx', 'svelte', 'toml', 'yaml', 'yml', 'css', 'html', 'json']);

export function rawBlobHeaders(path: string, visibility: 'public' | 'private', contentLength: string | null, immutableRevision: boolean) {
  const headers = new Headers({
    'content-type': rawContentType(path),
    'cache-control': visibility === 'public'
      ? immutableRevision ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate'
      : 'private, no-store',
    'content-security-policy': "default-src 'none'; sandbox",
    'x-content-type-options': 'nosniff'
  });
  if (contentLength && /^\d+$/.test(contentLength)) headers.set('content-length', contentLength);
  if (extension(path) === 'svg') headers.set('content-disposition', `attachment; filename*=UTF-8''${encodedFileName(path)}`);
  return headers;
}

function rawContentType(path: string) {
  const suffix = extension(path);
  if (textExtensions.has(suffix)) return 'text/plain; charset=utf-8';
  if (suffix === 'png') return 'image/png';
  if (suffix === 'jpg' || suffix === 'jpeg') return 'image/jpeg';
  if (suffix === 'gif') return 'image/gif';
  return 'application/octet-stream';
}

function extension(path: string) {
  return path.split('.').at(-1)?.toLowerCase() ?? '';
}

function encodedFileName(path: string) {
  const fileName = path.split('/').at(-1) ?? 'file';
  return encodeURIComponent(fileName).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}
