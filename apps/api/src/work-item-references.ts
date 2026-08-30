import type { Principal } from './auth';
import { auditStatement } from './audit';
import { identifier } from './domain';
import type { D1PreparedStatement, Env } from './platform';
import { authorizeRepositoryId } from './repository-access';

type WorkItemKind = 'issue' | 'pull';
type ContentKind = 'body' | 'comment';

type ReferenceSource = {
  kind: WorkItemKind;
  id: string;
  owner: string;
  repository: string;
};

type ParsedReference = {
  owner: string;
  repository: string;
  kind: WorkItemKind;
  number: number;
  closes: boolean;
};

type ReferenceRow = {
  id: string;
  sourceIssueId: string | null;
  sourcePullId: string | null;
  targetIssueId: string | null;
  targetPullId: string | null;
  closesTarget: number;
  createdAt: string;
};

type ItemRow = {
  id: string;
  repositoryId: string;
  owner: string;
  repository: string;
  number: number;
  title: string;
  state: string;
};

export type LinkedWorkItem = {
  id: string;
  kind: WorkItemKind;
  repository: { owner: string; name: string };
  number: number;
  title: string;
  state: string;
  closes: boolean;
  direction: 'references' | 'referenced_by';
};

export type ReferenceEvent = {
  id: string;
  source?: Omit<LinkedWorkItem, 'closes' | 'direction'>;
  createdAt: string;
};

export async function referenceStatements(
  env: Env,
  principal: Principal,
  source: ReferenceSource,
  contentKind: ContentKind,
  contentId: string,
  content: string
): Promise<D1PreparedStatement[]> {
  const references = parseReferences(content, source, source.kind === 'pull' && contentKind === 'body');
  const [existing, repositories] = await Promise.all([
    env.DB.prepare('SELECT id,target_issue_id AS targetIssueId,target_pull_id AS targetPullId,closes_target AS closesTarget FROM work_item_references WHERE source_content_kind=? AND source_content_id=?').bind(contentKind, contentId).all<{ id: string; targetIssueId: string | null; targetPullId: string | null; closesTarget: number }>(),
    references.length ? resolveRepositories(env, principal, references) : Promise.resolve(new Map<string, string>())
  ]);
  const targets = references.length ? await resolveTargets(env, references, repositories) : new Map<string, { id: string; kind: WorkItemKind }>();
  const desired = new Map<string, { target: { id: string; kind: WorkItemKind }; closes: boolean }>();
  for (const reference of references) {
    const target = targets.get(referenceKey(reference));
    if (!target || (target.kind === source.kind && target.id === source.id)) continue;
    desired.set(`${target.kind}:${target.id}`, { target, closes: reference.closes && target.kind === 'issue' });
  }
  const statements: D1PreparedStatement[] = [];
  for (const row of existing.results) {
    const key = row.targetIssueId ? `issue:${row.targetIssueId}` : `pull:${row.targetPullId}`;
    const next = desired.get(key);
    if (!next) statements.push(env.DB.prepare('DELETE FROM work_item_references WHERE id=?').bind(row.id));
    else {
      desired.delete(key);
      if (Boolean(row.closesTarget) !== next.closes) statements.push(env.DB.prepare('UPDATE work_item_references SET closes_target=? WHERE id=?').bind(next.closes ? 1 : 0, row.id));
    }
  }
  for (const { target, closes } of desired.values()) {
    statements.push(env.DB.prepare(`INSERT INTO work_item_references (id,source_issue_id,source_pull_id,source_content_kind,source_content_id,target_issue_id,target_pull_id,closes_target,created_by) VALUES (?,?,?,?,?,?,?,?,?)`).bind(
      identifier('reference'),
      source.kind === 'issue' ? source.id : null,
      source.kind === 'pull' ? source.id : null,
      contentKind,
      contentId,
      target.kind === 'issue' ? target.id : null,
      target.kind === 'pull' ? target.id : null,
      closes ? 1 : 0,
      principal.id
    ));
  }
  return statements;
}

export function deleteReferenceStatements(env: Env, contentKind: ContentKind, contentId: string) {
  return [env.DB.prepare('DELETE FROM work_item_references WHERE source_content_kind=? AND source_content_id=?').bind(contentKind, contentId)];
}

export async function linkedWorkItems(env: Env, principal: Principal, kind: WorkItemKind, id: string): Promise<LinkedWorkItem[]> {
  const rows = await env.DB.prepare(`SELECT id,source_issue_id AS sourceIssueId,source_pull_id AS sourcePullId,target_issue_id AS targetIssueId,target_pull_id AS targetPullId,closes_target AS closesTarget,created_at AS createdAt FROM work_item_references WHERE ${kind === 'issue' ? 'source_issue_id=? OR target_issue_id=?' : 'source_pull_id=? OR target_pull_id=?'}`).bind(id, id).all<ReferenceRow>();
  const issueIds = new Set<string>();
  const pullIds = new Set<string>();
  for (const row of rows.results) {
    if (row.sourceIssueId && row.sourceIssueId !== id) issueIds.add(row.sourceIssueId);
    if (row.targetIssueId && row.targetIssueId !== id) issueIds.add(row.targetIssueId);
    if (row.sourcePullId && row.sourcePullId !== id) pullIds.add(row.sourcePullId);
    if (row.targetPullId && row.targetPullId !== id) pullIds.add(row.targetPullId);
  }
  const items = await loadItems(env, issueIds, pullIds);
  const readable = await readableItems(env, principal, items);
  const linked = new Map<string, LinkedWorkItem>();
  for (const row of rows.results) {
    const sourceMatches = kind === 'issue' ? row.sourceIssueId === id : row.sourcePullId === id;
    const otherKind: WorkItemKind = sourceMatches
      ? row.targetIssueId ? 'issue' : 'pull'
      : row.sourceIssueId ? 'issue' : 'pull';
    const otherId = sourceMatches
      ? row.targetIssueId ?? row.targetPullId
      : row.sourceIssueId ?? row.sourcePullId;
    if (!otherId) continue;
    const item = readable.get(`${otherKind}:${otherId}`);
    if (!item) continue;
    const key = `${otherKind}:${otherId}`;
    const previous = linked.get(key);
    linked.set(key, {
      id: item.id,
      kind: otherKind,
      repository: { owner: item.owner, name: item.repository },
      number: Number(item.number),
      title: item.title,
      state: item.state,
      closes: Boolean(previous?.closes || (sourceMatches && row.closesTarget)),
      direction: previous?.direction === 'references' || sourceMatches ? 'references' : 'referenced_by'
    });
  }
  return [...linked.values()].sort((left, right) => left.kind.localeCompare(right.kind) || left.repository.owner.localeCompare(right.repository.owner) || left.repository.name.localeCompare(right.repository.name) || left.number - right.number);
}

export async function hydrateReferenceEvents(env: Env, principal: Principal, ids: string[]): Promise<ReferenceEvent[]> {
  if (!ids.length) return [];
  const rows = await env.DB.prepare(`SELECT id,source_issue_id AS sourceIssueId,source_pull_id AS sourcePullId,target_issue_id AS targetIssueId,target_pull_id AS targetPullId,closes_target AS closesTarget,created_at AS createdAt FROM work_item_references WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all<ReferenceRow>();
  const issueIds = new Set(rows.results.flatMap((row) => row.sourceIssueId ? [row.sourceIssueId] : []));
  const pullIds = new Set(rows.results.flatMap((row) => row.sourcePullId ? [row.sourcePullId] : []));
  const readable = await readableItems(env, principal, await loadItems(env, issueIds, pullIds));
  return rows.results.map((row) => {
    const kind: WorkItemKind = row.sourceIssueId ? 'issue' : 'pull';
    const sourceId = row.sourceIssueId ?? row.sourcePullId ?? '';
    const item = readable.get(`${kind}:${sourceId}`);
    return {
      id: row.id,
      ...(item ? { source: { id: item.id, kind, repository: { owner: item.owner, name: item.repository }, number: Number(item.number), title: item.title, state: item.state } } : {}),
      createdAt: row.createdAt
    };
  });
}

export async function closingIssueStatements(env: Env, pullId: string, actor: Principal, pull: { owner: string; repository: string; number: number }) {
  const rows = await env.DB.prepare(`SELECT DISTINCT issues.id,issues.repository_id AS repositoryId,issues.number,issues.state,organizations.id AS organizationId FROM work_item_references JOIN issues ON issues.id=work_item_references.target_issue_id JOIN repositories ON repositories.id=issues.repository_id JOIN organizations ON organizations.id=repositories.organization_id WHERE work_item_references.source_pull_id=? AND work_item_references.closes_target=1 AND issues.state='open'`).bind(pullId).all<{ id: string; repositoryId: string; number: number; state: string; organizationId: string }>();
  const createdAt = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  for (const issue of rows.results) {
    const eventId = identifier('event');
    statements.push(
      env.DB.prepare(`UPDATE issues SET state='closed',closed_by=?,closed_at=?,updated_at=? WHERE id=? AND state='open'`).bind(actor.id, createdAt, createdAt, issue.id),
      env.DB.prepare('INSERT INTO issue_events (id,issue_id,actor_id,kind,details,created_at) VALUES (?,?,?,?,?,?)').bind(eventId, issue.id, actor.id, 'closed_by_pull', JSON.stringify({ owner: pull.owner, repository: pull.repository, number: String(pull.number) }), createdAt),
      auditStatement(env, { organizationId: issue.organizationId, repositoryId: issue.repositoryId, actor, action: 'issue.closed', subjectType: 'issue', subjectId: issue.id, details: { number: issue.number, closingPull: `${pull.owner}/${pull.repository}!${pull.number}` } })
    );
  }
  return { statements, issueIds: rows.results.map((row) => row.id) };
}

function parseReferences(content: string, source: ReferenceSource, detectClosing: boolean): ParsedReference[] {
  const text = stripCode(content);
  const closing = detectClosing ? closingReferenceKeys(text, source) : new Set<string>();
  const references = new Map<string, ParsedReference>();
  for (const reference of scanReferences(text, source)) {
    const key = referenceKey(reference);
    references.set(key, { ...reference, closes: closing.has(key) });
    if (references.size >= 50) break;
  }
  return [...references.values()];
}

function scanReferences(content: string, source: Pick<ReferenceSource, 'owner' | 'repository'>): ParsedReference[] {
  const references: ParsedReference[] = [];
  const pattern = /(^|[^\w/])(?:([a-z0-9](?:[a-z0-9_.-]*[a-z0-9])?)\/([a-z0-9](?:[a-z0-9_.-]*[a-z0-9])?))?([#!])(\d+)\b/gim;
  for (const match of content.matchAll(pattern)) {
    const number = Number(match[5]);
    if (!Number.isSafeInteger(number) || number < 1) continue;
    references.push({ owner: match[2] ?? source.owner, repository: match[3] ?? source.repository, kind: match[4] === '#' ? 'issue' : 'pull', number, closes: false });
  }
  return references;
}

function closingReferenceKeys(content: string, source: Pick<ReferenceSource, 'owner' | 'repository'>) {
  const keys = new Set<string>();
  const item = String.raw`(?:[a-z0-9](?:[a-z0-9_.-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9_.-]*[a-z0-9])?)?#\d+`;
  const clause = new RegExp(String.raw`\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+(${item}(?:\s*(?:,|and)\s*${item})*)`, 'gim');
  for (const match of content.matchAll(clause)) {
    for (const reference of scanReferences(match[1], source)) if (reference.kind === 'issue') keys.add(referenceKey(reference));
  }
  return keys;
}

function stripCode(content: string) {
  return content.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, '').replace(/`[^`\n]*`/g, '').replace(/<!--[\s\S]*?-->/g, '');
}

function referenceKey(reference: Pick<ParsedReference, 'owner' | 'repository' | 'kind' | 'number'>) {
  return `${reference.owner.toLowerCase()}/${reference.repository.toLowerCase()}:${reference.kind}:${reference.number}`;
}

async function resolveRepositories(env: Env, principal: Principal, references: ParsedReference[]) {
  const names = [...new Map(references.map((reference) => [`${reference.owner.toLowerCase()}/${reference.repository.toLowerCase()}`, reference])).values()];
  const access = readableRepositoryFilter(principal);
  if (access.sql === '0=1') return new Map<string, string>();
  const pairs = names.map(() => '(organizations.slug=? COLLATE NOCASE AND repositories.name=? COLLATE NOCASE)').join(' OR ');
  const values = names.flatMap((reference) => [reference.owner, reference.repository]);
  const rows = await env.DB.prepare(`SELECT repositories.id,organizations.slug AS owner,repositories.name FROM repositories JOIN organizations ON organizations.id=repositories.organization_id WHERE (${pairs}) AND ${access.sql}`).bind(...values, ...access.values).all<{ id: string; owner: string; name: string }>();
  return new Map(rows.results.map((row) => [`${row.owner.toLowerCase()}/${row.name.toLowerCase()}`, row.id]));
}

async function resolveTargets(env: Env, references: ParsedReference[], repositories: Map<string, string>) {
  const candidates = references.flatMap((reference) => {
    const repositoryId = repositories.get(`${reference.owner.toLowerCase()}/${reference.repository.toLowerCase()}`);
    return repositoryId ? [{ ...reference, repositoryId }] : [];
  });
  const targets = new Map<string, { id: string; kind: WorkItemKind }>();
  for (const kind of ['issue', 'pull'] as const) {
    const values = candidates.filter((candidate) => candidate.kind === kind);
    if (!values.length) continue;
    const table = kind === 'issue' ? 'issues' : 'pull_requests';
    const rows = await env.DB.prepare(`SELECT id,repository_id AS repositoryId,number FROM ${table} WHERE ${values.map(() => '(repository_id=? AND number=?)').join(' OR ')}`).bind(...values.flatMap((value) => [value.repositoryId, value.number])).all<{ id: string; repositoryId: string; number: number }>();
    const repositoryNames = new Map([...repositories.entries()].map(([name, id]) => [id, name]));
    for (const row of rows.results) {
      const name = repositoryNames.get(row.repositoryId);
      if (name) targets.set(`${name}:${kind}:${row.number}`, { id: row.id, kind });
    }
  }
  return targets;
}

async function loadItems(env: Env, issueIds: Set<string>, pullIds: Set<string>) {
  const [issues, pulls] = await Promise.all([
    loadItemKind(env, 'issues', issueIds),
    loadItemKind(env, 'pull_requests', pullIds)
  ]);
  return new Map([...issues.map((item) => [`issue:${item.id}`, item] as const), ...pulls.map((item) => [`pull:${item.id}`, item] as const)]);
}

async function loadItemKind(env: Env, table: 'issues' | 'pull_requests', ids: Set<string>) {
  if (!ids.size) return [];
  return env.DB.prepare(`SELECT ${table}.id,${table}.repository_id AS repositoryId,organizations.slug AS owner,repositories.name AS repository,${table}.number,${table}.title,${table}.state FROM ${table} JOIN repositories ON repositories.id=${table}.repository_id JOIN organizations ON organizations.id=repositories.organization_id WHERE ${table}.id IN (${[...ids].map(() => '?').join(',')})`).bind(...ids).all<ItemRow>().then((result) => result.results);
}

async function readableItems(env: Env, principal: Principal, items: Map<string, ItemRow>) {
  const repositoryIds = [...new Set([...items.values()].map((item) => item.repositoryId))];
  const access = new Map(await Promise.all(repositoryIds.map(async (id) => [id, Boolean(await authorizeRepositoryId(env, principal, id, 'repository.read'))] as const)));
  return new Map([...items].filter(([, item]) => access.get(item.repositoryId)));
}

function readableRepositoryFilter(principal: Principal) {
  if (principal.authType === 'token' && !principal.tokenScopes?.some((scope) => ['repo:read', 'repo:write', 'repo:admin'].includes(scope))) return { sql: '0=1', values: [] };
  const member = `(EXISTS (SELECT 1 FROM organization_members WHERE organization_members.organization_id=repositories.organization_id AND organization_members.user_id=?) OR EXISTS (SELECT 1 FROM repository_collaborators WHERE repository_collaborators.repository_id=repositories.id AND repository_collaborators.user_id=?) OR EXISTS (SELECT 1 FROM repository_team_grants JOIN team_members ON team_members.team_id=repository_team_grants.team_id WHERE repository_team_grants.repository_id=repositories.id AND team_members.user_id=?))`;
  const values = [principal.id, principal.id, principal.id];
  const base = `(repositories.visibility='public' OR ${member})`;
  if (principal.authType !== 'token' || !principal.tokenRepositoryIds) return { sql: base, values };
  if (!principal.tokenRepositoryIds.length) return { sql: '0=1', values: [] };
  return { sql: `${base} AND repositories.id IN (${principal.tokenRepositoryIds.map(() => '?').join(',')})`, values: [...values, ...principal.tokenRepositoryIds] };
}
