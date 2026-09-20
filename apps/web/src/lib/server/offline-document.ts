import { render } from 'svelte/server';
import { dev } from '$app/environment';
import OfflinePage from '$lib/errors/OfflinePage.svelte';
import canvasStyles from '../../app.css?inline';
import controlStyles from '$lib/styles/controls.css?inline';
import errorStyles from '$lib/errors/error-page.css?inline';
import script from '$lib/errors/offline-client.js?raw';

async function sourceHash(source: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  return `sha256-${btoa(String.fromCharCode(...new Uint8Array(digest)))}`;
}

export async function offlineDocument() {
  const styles = `${canvasStyles}\n${controlStyles}\n${errorStyles}`;
  const [styleHash, scriptHash] = await Promise.all([sourceHash(styles), sourceHash(script)]);
  const policy = `default-src 'none'; script-src '${scriptHash}'; worker-src 'self'; style-src '${styleHash}'; style-src-attr 'unsafe-inline'; img-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'`;
  const { body } = render(OfflinePage);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#0d0d0f">
    <meta name="robots" content="noindex, nofollow">
    <meta http-equiv="Content-Security-Policy" content="${policy}">
    <title>Marl isn’t answering. · Marl</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    <style>${styles}</style>
    <script data-worker-type="${dev ? 'module' : 'classic'}">${script}</script>
  </head>
  <body>${body}</body>
</html>`;
}
