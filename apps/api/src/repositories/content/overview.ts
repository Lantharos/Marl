import { auditStatement } from '../../core/audit';
import type { Principal } from '../../auth/principal';
import { safeRepositoryPath } from '../../core/domain';
import { json, problem, readJson } from '../../http/http';
import type { Env } from '../../core/platform';
import { repositoryOverviewBody } from '../../http/request-schemas';
import { authorizeRepository } from '../access/access';

type OverviewDocument = { path: string; label: string };

const overviewNames = [
  [/^readme(?:\.(?:md|markdown|txt))?$/i, 'README'],
  [/^(?:license|copying)(?:\.(?:md|markdown|txt))?$/i, 'License'],
  [/^contributing(?:\.(?:md|markdown|txt))?$/i, 'Contributing'],
  [/^code[_-]of[_-]conduct(?:\.(?:md|markdown|txt))?$/i, 'Code of conduct'],
  [/^security(?:\.(?:md|markdown|txt))?$/i, 'Security'],
  [/^support(?:\.(?:md|markdown|txt))?$/i, 'Support']
] as const;

export async function getRepositoryOverview(
  env: Env,
  principal: Principal | null,
  owner: string,
  name: string
): Promise<Response> {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.read');
  if (!repository) return problem(404, 'repository_not_found', 'Repository not found.');
  const available = await overviewCandidates(env, repository.id, repository.defaultBranch);
  const stored = await env.DB.prepare('SELECT overview_documents_json AS documentsJson FROM repositories WHERE id=?')
    .bind(repository.id)
    .first<{ documentsJson: string | null }>();
  const selected =
    stored?.documentsJson === null || stored?.documentsJson === undefined
      ? automaticOverviewDocuments(available)
      : selectedOverviewDocuments(available, stored.documentsJson);
  return json({
    documents: selected,
    availableDocuments: available,
    canManage: repository.role === 'maintain' || repository.role === 'admin'
  });
}

export async function updateRepositoryOverview(
  request: Request,
  env: Env,
  principal: Principal,
  owner: string,
  name: string
): Promise<Response> {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.maintain');
  if (!repository) return problem(404, 'repository_not_found', 'Repository not found.');
  const body = await readJson(request, repositoryOverviewBody);
  if (!body) return problem(400, 'invalid_json', 'Expected a valid overview document list.');
  const paths = [...new Set(body.documents)];
  if (paths.length !== body.documents.length || paths.some((path) => !safeRepositoryPath(path)))
    return problem(422, 'invalid_overview_documents', 'Overview documents must be unique repository paths.');
  const available = await overviewCandidates(env, repository.id, repository.defaultBranch);
  const availablePaths = new Set(available.map((document) => document.path));
  if (paths.some((path) => !availablePaths.has(path)))
    return problem(
      422,
      'overview_document_not_found',
      'Every overview document must exist on the default branch and use Markdown or plain text.'
    );
  await env.DB.batch([
    env.DB.prepare('UPDATE repositories SET overview_documents_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(
      JSON.stringify(paths),
      repository.id
    ),
    auditStatement(env, {
      organizationId: repository.organizationId,
      repositoryId: repository.id,
      actor: principal,
      action: 'repository.overview.updated',
      subjectType: 'repository',
      subjectId: repository.id,
      details: { documents: paths }
    })
  ]);
  return json({
    documents: paths.map((path) => available.find((document) => document.path === path)!)
  });
}

async function overviewCandidates(env: Env, repositoryId: string, defaultBranch: string): Promise<OverviewDocument[]> {
  const rows = await env.DB.prepare(
    `SELECT repository_entries.path,repository_entries.name FROM branches JOIN commits ON commits.repository_id=branches.repository_id AND commits.id=branches.commit_id JOIN repository_entries ON repository_entries.repository_id=branches.repository_id AND repository_entries.tree_id=commits.tree_id WHERE branches.repository_id=? AND branches.name=? AND repository_entries.kind='blob' AND (lower(repository_entries.name) LIKE '%.md' OR lower(repository_entries.name) LIKE '%.markdown' OR lower(repository_entries.name) LIKE '%.txt' OR instr(repository_entries.name,'.')=0) ORDER BY repository_entries.path COLLATE NOCASE LIMIT 500`
  )
    .bind(repositoryId, defaultBranch)
    .all<{ path: string; name: string }>();
  return rows.results.map((entry) => ({
    path: entry.path,
    label: overviewLabel(entry.name)
  }));
}

function automaticOverviewDocuments(available: OverviewDocument[]) {
  return overviewNames.flatMap(([pattern, label]) => {
    const document = available.find((candidate) => !candidate.path.includes('/') && pattern.test(candidate.path));
    return document ? [{ ...document, label }] : [];
  });
}

function selectedOverviewDocuments(available: OverviewDocument[], value: string) {
  let paths: unknown;
  try {
    paths = JSON.parse(value);
  } catch {
    return automaticOverviewDocuments(available);
  }
  if (!Array.isArray(paths)) return automaticOverviewDocuments(available);
  const documents = new Map(available.map((document) => [document.path, document]));
  return paths.flatMap((path) => (typeof path === 'string' && documents.has(path) ? [documents.get(path)!] : []));
}

function overviewLabel(name: string) {
  const known = overviewNames.find(([pattern]) => pattern.test(name));
  if (known) return known[1];
  return name
    .replace(/\.(?:md|markdown|txt)$/i, '')
    .replaceAll(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
