import type { Principal } from './auth';
import { json, problem } from './http';
import type { Env } from './platform';
import { repositoryListFilter } from './repository-access';

type SearchResult = {
  kind: 'repository' | 'commit' | 'file' | 'issue' | 'pull' | 'run' | 'user' | 'organization';
  label: string;
  detail: string;
  href: string;
};

function likeQuery(value: string) {
  return `%${value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
}

export async function search(env: Env, principal: Principal, url: URL): Promise<Response> {
  const query = (url.searchParams.get('q') ?? '').trim();
  if (query.length < 2) return json({ results: [] });
  if (query.length > 100) return problem(422, 'search_too_long', 'Search queries are limited to 100 characters.');
  const match = likeQuery(query);
  const access = repositoryListFilter(principal);
  const bind = (...tail: unknown[]) => [...access.values, ...tail];

  const [repositories, commits, files, issues, pulls, runs, users, organizations] = await Promise.all([
    env.DB.prepare(`SELECT organizations.slug AS owner,repositories.name,repositories.description FROM repositories JOIN organizations ON organizations.id=repositories.organization_id WHERE ${access.sql} AND repositories.deletion_scheduled_at IS NULL AND (repositories.name LIKE ? ESCAPE '\\' OR organizations.slug LIKE ? ESCAPE '\\' OR repositories.description LIKE ? ESCAPE '\\') ORDER BY repositories.updated_at DESC LIMIT 8`).bind(...bind(match, match, match)).all<{ owner: string; name: string; description: string }>(),
    env.DB.prepare(`SELECT organizations.slug AS owner,repositories.name AS repository,commits.id,commits.title,commits.author_name AS author FROM commits JOIN repositories ON repositories.id=commits.repository_id JOIN organizations ON organizations.id=repositories.organization_id WHERE ${access.sql} AND (commits.id LIKE ? ESCAPE '\\' OR commits.title LIKE ? ESCAPE '\\' OR commits.author_name LIKE ? ESCAPE '\\') ORDER BY commits.authored_at DESC LIMIT 8`).bind(...bind(match, match, match)).all<{ owner: string; repository: string; id: string; title: string; author: string }>(),
    env.DB.prepare(`SELECT organizations.slug AS owner,repositories.name AS repository,repositories.default_branch AS branch,repository_entries.path,repository_entries.kind FROM repository_entries JOIN repositories ON repositories.id=repository_entries.repository_id JOIN organizations ON organizations.id=repositories.organization_id JOIN branches ON branches.repository_id=repositories.id AND branches.name=repositories.default_branch AND branches.commit_id IN (SELECT id FROM commits WHERE commits.repository_id=repositories.id AND commits.tree_id=repository_entries.tree_id) WHERE ${access.sql} AND repository_entries.path LIKE ? ESCAPE '\\' ORDER BY length(repository_entries.path),repository_entries.path LIMIT 8`).bind(...bind(match)).all<{ owner: string; repository: string; branch: string; path: string; kind: string }>(),
    env.DB.prepare(`SELECT organizations.slug AS owner,repositories.name AS repository,issues.number,issues.title,users.handle AS author FROM issues JOIN repositories ON repositories.id=issues.repository_id JOIN organizations ON organizations.id=repositories.organization_id JOIN users ON users.id=issues.author_id WHERE ${access.sql} AND (issues.title LIKE ? ESCAPE '\\' OR users.handle LIKE ? ESCAPE '\\') ORDER BY issues.updated_at DESC LIMIT 8`).bind(...bind(match, match)).all<{ owner: string; repository: string; number: number; title: string; author: string }>(),
    env.DB.prepare(`SELECT organizations.slug AS owner,repositories.name AS repository,pull_requests.number,pull_requests.title,users.handle AS author FROM pull_requests JOIN repositories ON repositories.id=pull_requests.repository_id JOIN organizations ON organizations.id=repositories.organization_id JOIN users ON users.id=pull_requests.author_id WHERE ${access.sql} AND (pull_requests.title LIKE ? ESCAPE '\\' OR users.handle LIKE ? ESCAPE '\\' OR pull_requests.source_branch LIKE ? ESCAPE '\\') ORDER BY pull_requests.updated_at DESC LIMIT 8`).bind(...bind(match, match, match)).all<{ owner: string; repository: string; number: number; title: string; author: string }>(),
    env.DB.prepare(`SELECT organizations.slug AS owner,repositories.name AS repository,runs.number,runs.name,runs.state,runs.branch FROM runs JOIN repositories ON repositories.id=runs.repository_id JOIN organizations ON organizations.id=repositories.organization_id WHERE ${access.sql} AND (runs.name LIKE ? ESCAPE '\\' OR runs.branch LIKE ? ESCAPE '\\' OR runs.commit_id LIKE ? ESCAPE '\\') ORDER BY runs.created_at DESC LIMIT 8`).bind(...bind(match, match, match)).all<{ owner: string; repository: string; number: number; name: string; state: string; branch: string }>(),
    env.DB.prepare(`SELECT handle,display_name AS displayName,bio FROM users WHERE handle LIKE ? ESCAPE '\\' OR display_name LIKE ? ESCAPE '\\' ORDER BY handle LIMIT 6`).bind(match, match).all<{ handle: string; displayName: string; bio: string }>(),
    env.DB.prepare(`SELECT slug,name,description FROM organizations WHERE kind='team' AND (slug LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\') ORDER BY name LIMIT 6`).bind(match, match).all<{ slug: string; name: string; description: string }>()
  ]);

  const results: SearchResult[] = [
    ...users.results.map((item) => ({ kind: 'user' as const, label: item.displayName, detail: `@${item.handle}${item.bio ? ` · ${item.bio}` : ''}`, href: `/${item.handle}` })),
    ...organizations.results.map((item) => ({ kind: 'organization' as const, label: item.name, detail: `${item.slug}${item.description ? ` · ${item.description}` : ''}`, href: `/${item.slug}` })),
    ...repositories.results.map((item) => ({ kind: 'repository' as const, label: `${item.owner}/${item.name}`, detail: item.description || 'Repository', href: `/${item.owner}/${item.name}` })),
    ...files.results.map((item) => ({ kind: 'file' as const, label: item.path, detail: `${item.owner}/${item.repository} · ${item.branch}`, href: `/${item.owner}/${item.repository}/${item.kind === 'tree' ? 'tree' : 'blob'}/${encodeURIComponent(item.branch)}/${item.path.split('/').map(encodeURIComponent).join('/')}` })),
    ...commits.results.map((item) => ({ kind: 'commit' as const, label: item.title, detail: `${item.owner}/${item.repository} · ${item.id.slice(0, 7)} · ${item.author}`, href: `/${item.owner}/${item.repository}/commit/${item.id}` })),
    ...issues.results.map((item) => ({ kind: 'issue' as const, label: item.title, detail: `${item.owner}/${item.repository} #${item.number} · ${item.author}`, href: `/${item.owner}/${item.repository}/issues/${item.number}` })),
    ...pulls.results.map((item) => ({ kind: 'pull' as const, label: item.title, detail: `${item.owner}/${item.repository} !${item.number} · ${item.author}`, href: `/${item.owner}/${item.repository}/pulls/${item.number}` })),
    ...runs.results.map((item) => ({ kind: 'run' as const, label: item.name, detail: `${item.owner}/${item.repository} · #${item.number} · ${item.branch} · ${item.state}`, href: `/${item.owner}/${item.repository}/runs/${item.number}` }))
  ];
  return json({ results });
}
