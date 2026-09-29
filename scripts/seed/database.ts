import { join } from 'node:path';
import { run } from '../qualification/process';

const api = join(import.meta.dir, '..', '..', 'apps', 'api');

export async function query<T>(sql: string): Promise<T[]> {
  const result = await run(['bunx', 'wrangler', 'd1', 'execute', 'marl', '--local', '--json', '--command', sql], {
    cwd: api,
    timeoutMs: 120_000
  });
  return (JSON.parse(result.stdout) as Array<{ results: T[] }>).flatMap((statement) => statement.results);
}

export async function execute(statements: string[]) {
  const file = join(api, '.wrangler', `seed-${Date.now()}.sql`);
  await Bun.write(file, statements.join(';\n') + ';\n');
  try {
    await run(['bunx', 'wrangler', 'd1', 'execute', 'marl', '--local', '--file', file], {
      cwd: api,
      timeoutMs: 120_000
    });
  } finally {
    await Bun.file(file).delete();
  }
}

export function quote(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

const skippedTables = /^(audit_events|auth_|d1_|_cf_|sqlite_)/;

export async function spreadTimestamps(startedAt: Date, days: number) {
  const start = startedAt.toISOString();
  const end = new Date().toISOString();
  const factor = (days * 86_400_000) / Math.max(1, Date.parse(end) - Date.parse(start));
  const tables = await query<{ name: string; sql: string }>("SELECT name,sql FROM sqlite_master WHERE type='table'");
  const columns = tables
    .filter(({ name }) => !skippedTables.test(name))
    .flatMap(({ name, sql }) =>
      [...sql.matchAll(/[`"](\w+_at)[`"]/g)]
        .map((match) => match[1])
        .filter((column) => !column.includes('expires'))
        .map((column) => ({ table: name, column }))
    );
  const moved = (column: string) =>
    `julianday(${quote(end)})-(julianday(${quote(end)})-julianday(${column}))*${factor}`;
  await execute(
    columns.map(
      ({ table, column }) =>
        `UPDATE "${table}" SET "${column}"=CASE WHEN "${column}" LIKE '%T%' THEN strftime('%Y-%m-%dT%H:%M:%fZ',${moved(`"${column}"`)}) ELSE strftime('%Y-%m-%d %H:%M:%S',${moved(`"${column}"`)}) END WHERE "${column}" IS NOT NULL AND julianday("${column}")>=julianday(${quote(start)})`
    )
  );
}
