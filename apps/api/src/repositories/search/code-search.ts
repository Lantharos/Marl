import type { CodeDefinition, CodeSearchFile, CodeSearchResult } from '@marl/contracts';
import type { Principal } from '../../auth/principal';
import type { Env } from '../../core/platform';
import { requestGitGateway } from '../../git/gateway';
import { json, problem, readJsonValue } from '../../http/http';
import { authorizeRepository } from '../access/access';
import { parseCodeQuery } from './query';

const maximumQueryLength = 256;
const generatedFile =
  /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|Cargo\.lock|go\.sum|composer\.lock|Gemfile\.lock|poetry\.lock)$|\.(min\.(js|css)|map|snap)$/i;
const identifierPattern = /^[A-Za-z_$][\w$]{1,199}$/;
const maximumResponseBytes = 4 * 1024 * 1024;

export async function searchRepositoryCode(
  env: Env,
  principal: Principal | null,
  owner: string,
  name: string,
  url: URL
): Promise<Response> {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.read');
  if (!repository) return problem(404, 'repository_not_found', 'Repository not found.');
  const input = url.searchParams.get('q') ?? '';
  if (input.length > maximumQueryLength)
    return problem(422, 'search_too_long', `Search queries are limited to ${maximumQueryLength} characters.`);
  const query = parseCodeQuery(input, {
    regex: url.searchParams.get('regex') === '1',
    caseSensitive: url.searchParams.get('case') === '1'
  });
  const revision = url.searchParams.get('ref') || repository.defaultBranch;
  const commit = await env.DB.prepare(
    'SELECT commit_id AS id FROM branches WHERE repository_id=?1 AND name=?2 UNION ALL SELECT id FROM commits WHERE repository_id=?1 AND id=?2 LIMIT 1'
  )
    .bind(repository.id, revision)
    .first<{ id: string }>();
  if (!commit) return problem(404, 'revision_not_found', 'That branch or commit does not exist.');
  if (!query.pattern)
    return json({
      revision,
      commitId: commit.id,
      definitions: [],
      files: [],
      truncated: false
    } satisfies CodeSearchResult);
  const [response, definitions] = await Promise.all([
    requestGitGateway(
      env,
      '/_marl/search',
      { owner, repository: name, commitId: commit.id, ...query },
      { timeoutMs: 20_000 }
    ),
    !query.regex && identifierPattern.test(query.pattern)
      ? findDefinitions(env, repository.id, commit.id, query.pattern)
      : []
  ]);
  if (response.status === 422) {
    await response.body?.cancel();
    return problem(422, 'invalid_search_pattern', 'This regular expression is not valid.');
  }
  const result = response.ok
    ? await readJsonValue<{ files: CodeSearchFile[]; truncated: boolean }>(response, maximumResponseBytes)
    : null;
  if (!result) {
    await response.body?.cancel();
    return problem(502, 'code_search_unavailable', 'Code search is unavailable right now.');
  }
  const needle = query.regex ? null : query.pattern.toLowerCase();
  const rank = (file: CodeSearchFile) =>
    (generatedFile.test(file.path) ? 2 : 0) + (needle && file.path.toLowerCase().includes(needle) ? 0 : 1);
  const files = result.files.toSorted((left, right) => rank(left) - rank(right) || left.path.localeCompare(right.path));
  return json(
    { revision, commitId: commit.id, definitions, files, truncated: result.truncated } satisfies CodeSearchResult,
    {
      headers: { 'cache-control': 'private, max-age=60', vary: 'Cookie, Authorization' }
    }
  );
}

async function findDefinitions(env: Env, repositoryId: string, commitId: string, name: string) {
  const rows = await env.DB.prepare(
    `SELECT code_symbols.name,code_symbols.kind,code_symbols.path,code_symbols.line FROM repository_symbol_indexes JOIN code_symbols ON code_symbols.repository_id=repository_symbol_indexes.repository_id WHERE repository_symbol_indexes.repository_id=? AND repository_symbol_indexes.commit_id=? AND code_symbols.name=? COLLATE NOCASE ORDER BY code_symbols.name=? DESC,code_symbols.path,code_symbols.line LIMIT 10`
  )
    .bind(repositoryId, commitId, name, name)
    .all<CodeDefinition>();
  return rows.results;
}
