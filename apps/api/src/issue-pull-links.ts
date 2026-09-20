import { integer, minValue, number, pipe, strictObject } from 'valibot';
import type { Principal } from './auth';
import { auditStatement } from './audit';
import { json, problem, readJson } from './http';
import type { Env } from './platform';
import { authorizeRepository, repositoryCan } from './repository-access';
import { linkedWorkItems } from './work-item-references';

const linkBody = strictObject({ pullNumber: pipe(number(), integer(), minValue(1)) });

export async function linkIssuePull(request: Request, env: Env, principal: Principal, owner: string, name: string, number: number) {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.read');
  if (!repository) return problem(404, 'repository_not_found', 'Repository not found.');
  const issue = await env.DB.prepare('SELECT id,author_id AS authorId FROM issues WHERE repository_id=? AND number=?').bind(repository.id, number).first<{ id: string; authorId: string }>();
  if (!issue || (issue.authorId !== principal.id && !repositoryCan(repository, principal, 'repository.triage'))) return problem(404, 'issue_not_found', 'Editable issue not found.');
  const input = await readJson(request, linkBody);
  if (!input) return problem(422, 'invalid_pull', 'Choose a pull in this repository.');
  const pull = await env.DB.prepare('SELECT id FROM pull_requests WHERE repository_id=? AND number=?').bind(repository.id, input.pullNumber).first<{ id: string }>();
  if (!pull) return problem(404, 'pull_not_found', 'Pull not found.');
  await env.DB.batch([
    env.DB.prepare('INSERT INTO issue_pull_links (issue_id,pull_request_id,created_by) VALUES (?,?,?) ON CONFLICT DO NOTHING').bind(issue.id, pull.id, principal.id),
    auditStatement(env, { organizationId: repository.organizationId, repositoryId: repository.id, actor: principal, action: 'issue.pull_linked', subjectType: 'issue', subjectId: issue.id, details: { pullId: pull.id } })
  ]);
  return json({ linkedItems: await linkedWorkItems(env, principal, 'issue', issue.id) });
}
