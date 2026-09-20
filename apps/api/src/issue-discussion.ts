import type { IssueConclusion } from '@marl/contracts';
import type { Principal } from './auth';
import { auditStatement } from './audit';
import { json, problem, readJson } from './http';
import type { Env } from './platform';
import { authorizeRepository } from './repository-access';
import { issueConclusionBody, issueParticipationBody } from './request-schemas';

export function issueConclusion(env: Env, issueId: string) {
  return env.DB.prepare('SELECT issue_conclusions.body,issue_conclusions.comment_id AS commentId,users.handle AS author,users.display_name AS authorDisplayName,issue_conclusions.updated_at AS updatedAt FROM issue_conclusions JOIN users ON users.id=issue_conclusions.author_id WHERE issue_id=?').bind(issueId).first<IssueConclusion>();
}

export async function issueParticipation(env: Env, issueId: string, userId?: string) {
  if (!userId) return { following: false, lastReadSequence: 0 };
  const row = await env.DB.prepare('SELECT following,last_read_sequence AS lastReadSequence FROM issue_participants WHERE issue_id=? AND user_id=?').bind(issueId, userId).first<{ following: number; lastReadSequence: number }>();
  return { following: Boolean(row?.following), lastReadSequence: Number(row?.lastReadSequence ?? 0) };
}

export async function updateIssueConclusion(request: Request, env: Env, principal: Principal, owner: string, name: string, number: number) {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.maintain');
  if (!repository) return problem(404, 'repository_not_found', 'Repository not found.');
  const issue = await env.DB.prepare('SELECT id FROM issues WHERE repository_id=? AND number=?').bind(repository.id, number).first<{ id: string }>();
  if (!issue) return problem(404, 'issue_not_found', 'Issue not found.');
  const input = await readJson(request, issueConclusionBody);
  if (!input) return problem(422, 'invalid_conclusion', 'Write a conclusion of up to 10,000 characters.');
  const body = input.body.trim();
  if (input.commentId && !await env.DB.prepare('SELECT id FROM issue_comments WHERE id=? AND issue_id=? AND deleted_at IS NULL').bind(input.commentId, issue.id).first()) return problem(422, 'invalid_conclusion_source', 'Choose a comment in this issue.');
  const updatedAt = new Date().toISOString();
  await env.DB.batch([
    body ? env.DB.prepare('INSERT INTO issue_conclusions (issue_id,body,comment_id,author_id,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(issue_id) DO UPDATE SET body=excluded.body,comment_id=excluded.comment_id,author_id=excluded.author_id,updated_at=excluded.updated_at').bind(issue.id, body, input.commentId ?? null, principal.id, updatedAt)
      : env.DB.prepare('DELETE FROM issue_conclusions WHERE issue_id=?').bind(issue.id),
    env.DB.prepare('UPDATE issues SET updated_at=? WHERE id=?').bind(updatedAt, issue.id),
    auditStatement(env, { organizationId: repository.organizationId, repositoryId: repository.id, actor: principal, action: 'issue.conclusion_updated', subjectType: 'issue', subjectId: issue.id })
  ]);
  return json({ conclusion: await issueConclusion(env, issue.id) });
}

export async function updateIssueParticipation(request: Request, env: Env, principal: Principal, owner: string, name: string, number: number) {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.read');
  if (!repository) return problem(404, 'repository_not_found', 'Repository not found.');
  const issue = await env.DB.prepare('SELECT id FROM issues WHERE repository_id=? AND number=?').bind(repository.id, number).first<{ id: string }>();
  if (!issue) return problem(404, 'issue_not_found', 'Issue not found.');
  const input = await readJson(request, issueParticipationBody);
  if (!input || (input.following === undefined && input.lastReadSequence === undefined)) return problem(422, 'invalid_participation', 'Choose a following state or read position.');
  if (input.lastReadSequence && !await env.DB.prepare('SELECT sequence FROM issue_timeline WHERE issue_id=? AND sequence=?').bind(issue.id, input.lastReadSequence).first()) return problem(422, 'invalid_read_position', 'Read position must belong to this issue.');
  await env.DB.prepare('INSERT INTO issue_participants (issue_id,user_id,following,last_read_sequence) VALUES (?,?,?,?) ON CONFLICT(issue_id,user_id) DO UPDATE SET following=CASE WHEN ? THEN excluded.following ELSE issue_participants.following END,last_read_sequence=MAX(issue_participants.last_read_sequence,excluded.last_read_sequence)').bind(issue.id, principal.id, input.following ? 1 : 0, input.lastReadSequence ?? 0, input.following === undefined ? 0 : 1).run();
  return json({ participation: await issueParticipation(env, issue.id, principal.id) });
}
