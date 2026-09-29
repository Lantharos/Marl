import { mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const api = join(root, 'apps', 'api');
const backup = join(root, '.marl-data', 'backups', String(Date.now()));
const local = [
  ['cloudflare', join(api, '.wrangler', 'state', 'v3')],
  ['repositories', join(root, '.marl-data', 'repositories')]
] as const;

await mkdir(backup, { recursive: true });
for (const [name, path] of local)
  await rename(path, join(backup, name)).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
  });
console.log(`Previous local data moved to ${backup}`);
const process = Bun.spawn(['bunx', 'wrangler', 'd1', 'migrations', 'apply', 'marl', '--local'], {
  cwd: api,
  stdout: 'inherit',
  stderr: 'inherit'
});
if ((await process.exited) !== 0) throw new Error('Database initialization failed.');
