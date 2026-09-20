import { rename } from 'node:fs/promises';
import { join } from 'node:path';

const api = join(import.meta.dir, '..', 'apps', 'api');
const state = join(api, '.wrangler', 'state', 'v3', 'd1');
const backup = join(api, '.wrangler', `d1-backup-${Date.now()}`);
try { await rename(state, backup); console.log(`Previous local database moved to ${backup}`); }
catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
const process = Bun.spawn(['bunx', 'wrangler', 'd1', 'migrations', 'apply', 'marl', '--local'], { cwd: api, stdout: 'inherit', stderr: 'inherit' });
if (await process.exited !== 0) throw new Error('Database initialization failed.');
