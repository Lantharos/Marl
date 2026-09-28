import type { Env } from '../core/platform';
import { json, problem, readJson } from '../http/http';
import { symbolPageBody, symbolStateBody } from '../http/request-schemas';

const removedPerStatement = 500;
const resetBatch = 1_000;

export async function getSymbolIndexState(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request, symbolStateBody);
  if (!body) return problem(422, 'invalid_symbol_state', 'Symbol index request is invalid.');
  const row = await env.DB.prepare('SELECT commit_id AS commitId FROM repository_symbol_indexes WHERE repository_id=?')
    .bind(body.repositoryId)
    .first<{ commitId: string }>();
  return json({ commitId: row?.commitId ?? null });
}

async function clearSymbols(env: Env, repositoryId: string) {
  for (;;) {
    const result = await env.DB.prepare(
      `DELETE FROM code_symbols WHERE rowid IN (SELECT rowid FROM code_symbols WHERE repository_id=? LIMIT ${resetBatch})`
    )
      .bind(repositoryId)
      .run();
    if (result.meta.changes < resetBatch) return;
  }
}

export async function storeSymbolPage(request: Request, env: Env): Promise<Response> {
  const page = await readJson(request, symbolPageBody);
  if (!page) return problem(422, 'invalid_symbol_page', 'Symbol page is invalid.');
  const exists = await env.DB.prepare('SELECT 1 AS found FROM repositories WHERE id=?').bind(page.repositoryId).first();
  if (!exists) return problem(404, 'repository_not_found', 'Repository not found.');
  if (page.reset) await clearSymbols(env, page.repositoryId);
  const paths = [...page.removed, ...page.files.map((file) => file.path)];
  const statements = [];
  for (let offset = 0; offset < paths.length; offset += removedPerStatement)
    statements.push(
      env.DB.prepare(
        'DELETE FROM code_symbols WHERE repository_id=?1 AND path IN (SELECT value FROM json_each(?2))'
      ).bind(page.repositoryId, JSON.stringify(paths.slice(offset, offset + removedPerStatement)))
    );
  if (page.files.some((file) => file.symbols.length))
    statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO code_symbols (repository_id,path,line,name,kind) SELECT ?1,json_extract(file.value,'$.path'),json_extract(symbol.value,'$.line'),json_extract(symbol.value,'$.name'),json_extract(symbol.value,'$.kind') FROM json_each(?2) AS file,json_each(file.value,'$.symbols') AS symbol`
      ).bind(page.repositoryId, JSON.stringify(page.files))
    );
  if (page.complete)
    statements.push(
      env.DB.prepare(
        'INSERT INTO repository_symbol_indexes (repository_id,commit_id) VALUES (?,?) ON CONFLICT(repository_id) DO UPDATE SET commit_id=excluded.commit_id,indexed_at=CURRENT_TIMESTAMP'
      ).bind(page.repositoryId, page.commitId)
    );
  if (statements.length) await env.DB.batch(statements);
  return new Response(null, { status: 204 });
}
