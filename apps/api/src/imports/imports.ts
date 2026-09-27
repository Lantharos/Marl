import type { RepositoryImport } from '@marl/contracts';
import type { Principal } from '../auth/principal';
import { identifier } from '../core/domain';
import type { Env } from '../core/platform';
import { encryptSecret } from '../core/secret-crypto';
import { json, problem, readJson } from '../http/http';
import { importBody } from '../http/request-schemas';
import { insertRepository } from '../repositories/repositories';
import { GitHubError, githubClient, parseGitHubSource, RateLimited, type GitHubRepository } from './github';

type ImportStatusRow = Omit<RepositoryImport, 'stats' | 'repository'> & {
  statsJson: string;
  owner: string;
  name: string;
};

export async function startImport(request: Request, env: Env, principal: Principal) {
  if (principal.authType !== 'session')
    return problem(403, 'browser_session_required', 'Import repositories from a browser session.');
  const body = await readJson(request, importBody);
  const source = body && parseGitHubSource(body.source);
  if (!body || !source) return problem(422, 'invalid_import_source', 'Enter a GitHub repository like owner/name.');
  const token = body.token?.trim() || null;
  const github = githubClient(token);
  let repository: GitHubRepository;
  let login: string | null = null;
  try {
    repository = await github<GitHubRepository>(`/repos/${source}`);
    if (token) login = (await github<{ login: string }>('/user').catch(() => null))?.login ?? null;
  } catch (error) {
    if (error instanceof RateLimited)
      return problem(
        429,
        'github_rate_limited',
        'GitHub limits anonymous requests. Add an access token and try again.'
      );
    if (error instanceof GitHubError) return problem(422, 'github_unavailable', error.message);
    throw error;
  }
  const created = await insertRepository(env, principal, {
    owner: body.owner,
    name: body.name?.trim() || repository.name,
    description: (repository.description ?? '').slice(0, 280),
    visibility: body.visibility ?? (repository.private ? 'private' : 'public'),
    defaultLabels: false
  });
  if (created instanceof Response) return created;
  const id = identifier('import');
  const encrypted = token ? await encryptSecret(env, created.organizationId, created.id, `import:${id}`, token) : null;
  await env.DB.batch([
    env.DB.prepare('UPDATE repositories SET default_branch=? WHERE id=?').bind(repository.default_branch, created.id),
    env.DB.prepare(
      'INSERT INTO repository_imports (id,repository_id,requested_by,source,default_branch,token_ciphertext,token_nonce,github_login,options_json) VALUES (?,?,?,?,?,?,?,?,?)'
    ).bind(
      id,
      created.id,
      principal.id,
      repository.full_name,
      repository.default_branch,
      encrypted?.ciphertext ?? null,
      encrypted?.nonce ?? null,
      login,
      JSON.stringify(body.include)
    )
  ]);
  await env.IMPORT_QUEUE.send({ importId: id });
  return json(
    { import: { id }, repository: { owner: body.owner, name: body.name?.trim() || repository.name } },
    { status: 202 }
  );
}

export async function getImport(env: Env, principal: Principal, importId: string) {
  const row = await env.DB.prepare(
    'SELECT repository_imports.id,repository_imports.source,repository_imports.status,repository_imports.step,repository_imports.stats_json AS statsJson,repository_imports.error,repository_imports.created_at AS createdAt,repository_imports.completed_at AS completedAt,organizations.slug AS owner,repositories.name FROM repository_imports JOIN repositories ON repositories.id=repository_imports.repository_id JOIN organizations ON organizations.id=repositories.organization_id WHERE repository_imports.id=? AND repository_imports.requested_by=?'
  )
    .bind(importId, principal.id)
    .first<ImportStatusRow>();
  if (!row) return problem(404, 'import_not_found', 'Import not found.');
  const { statsJson, owner, name, ...rest } = row;
  return json({
    import: { ...rest, stats: JSON.parse(statsJson), repository: { owner, name } } satisfies RepositoryImport
  });
}
