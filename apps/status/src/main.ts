import { copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { publishedHistory, record } from './history';
import { loadIncidents } from './incidents';
import { runProbes } from './probes';
import { renderPage } from './render';

const root = join(import.meta.dir, '..');
const output = join(root, 'dist');
const fonts = join(root, '..', 'web', 'static', 'fonts', 'open-runde');
const publishedUrl = process.env.STATUS_URL ?? 'https://status.marl.sh';

const [history, incidents, results] = await Promise.all([
  publishedHistory(`${publishedUrl}/history.json`),
  loadIncidents(join(root, 'incidents')),
  runProbes()
]);
const updated = record(history, results);

await mkdir(join(output, 'fonts'), { recursive: true });
await Promise.all([
  Bun.write(join(output, 'index.html'), renderPage(updated, incidents)),
  Bun.write(join(output, 'history.json'), JSON.stringify(updated)),
  Bun.write(join(output, 'CNAME'), 'status.marl.sh\n'),
  copyFile(join(root, 'src', 'style.css'), join(output, 'style.css')),
  copyFile(join(root, '..', 'web', 'static', 'favicon.svg'), join(output, 'favicon.svg')),
  ...['OpenRunde-Regular-latin.woff2', 'OpenRunde-Semibold-latin.woff2'].map((font) =>
    copyFile(join(fonts, font), join(output, 'fonts', font))
  )
]);

for (const result of results)
  console.log(`${result.component}: ${result.ok ? 'up' : 'down'} in ${result.latencyMs} ms (${result.detail})`);
