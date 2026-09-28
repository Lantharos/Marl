import type { RepositoryTemplates } from '@marl/contracts';
import type { Principal } from '../../auth/principal';
import type { Env } from '../../core/platform';
import { requestGitGateway } from '../../git/gateway';
import { json, problem, readBody } from '../../http/http';
import { authorizeRepository } from '../access/access';

const maximumTemplateBytes = 64 * 1024;
const templatePaths = {
  pull: [
    '.marl/pull_template.md',
    '.github/pull_request_template.md',
    'pull_request_template.md',
    'docs/pull_request_template.md'
  ],
  issue: ['.marl/issue_template.md', '.github/issue_template.md', 'issue_template.md', 'docs/issue_template.md']
};

export async function getRepositoryTemplates(env: Env, principal: Principal | null, owner: string, name: string) {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.read');
  if (!repository) return problem(404, 'repository_not_found', 'Repository not found.');
  const candidates = [...templatePaths.pull, ...templatePaths.issue];
  const entries = await env.DB.prepare(
    `SELECT lower(repository_entries.path) AS path,repository_entries.object_id AS objectId FROM branches JOIN commits ON commits.repository_id=branches.repository_id AND commits.id=branches.commit_id JOIN repository_entries ON repository_entries.repository_id=branches.repository_id AND repository_entries.tree_id=commits.tree_id WHERE branches.repository_id=? AND branches.name=? AND repository_entries.kind='blob' AND lower(repository_entries.path) IN (${candidates.map(() => '?').join(',')})`
  )
    .bind(repository.id, repository.defaultBranch, ...candidates)
    .all<{ path: string; objectId: string }>();
  const objects = new Map(entries.results.map((entry) => [entry.path, entry.objectId]));
  const read = async (paths: string[]) => {
    const objectId = paths.map((path) => objects.get(path)).find(Boolean);
    if (!objectId) return null;
    const response = await requestGitGateway(env, '/_marl/blob', { owner, repository: name, objectId });
    const bytes = response.ok ? await readBody(response, maximumTemplateBytes) : null;
    if (!bytes) await response.body?.cancel();
    return bytes ? new TextDecoder().decode(bytes) : null;
  };
  const [pull, issue] = await Promise.all([read(templatePaths.pull), read(templatePaths.issue)]);
  return json({ pull, issue } satisfies RepositoryTemplates, {
    headers: { 'cache-control': 'private, max-age=300', vary: 'Cookie, Authorization' }
  });
}
