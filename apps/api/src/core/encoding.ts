const encoder = new TextEncoder();

export async function sha256(value: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))).toHex();
}

export function base64Url(bytes: Uint8Array) {
  return bytes.toBase64({ alphabet: 'base64url', omitPadding: true });
}

export function fromBase64Url(value: string) {
  return Uint8Array.fromBase64(value, { alphabet: 'base64url' });
}

export function randomToken(byteLength = 32) {
  return base64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}
