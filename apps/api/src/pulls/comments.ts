import { renderBody } from '../core/markdown';
import type { Principal } from '../auth/principal';
import { canDeletePullComment } from './review/comment-access';
import { identifier } from '../core/domain';
import { json, problem, readJson } from '../http/http';
import type { Env } from '../core/platform';
import { canManageRepository as membership, pullRepository as repo } from './context';
import { commitPullUpdate } from './realtime/updates';
import { commentBody } from '../http/request-schemas';
import { authorizeRepository } from '../repositories/access/access';
import { deleteReferenceStatements, referenceStatements } from '../issues/references/work-items';
import { deleteMentionStatements, mentionStatements } from '../issues/references/mentions';

export async function addPullComment(
  request: Request,
  env: Env,
  principal: Principal,
  owner: string,
  name: string,
  number: number
): Promise<Response> {
  const repository = await repo(env, owner, name);
  if (!repository || !(await membership(env, principal, repository)))
    return problem(404, 'repository_not_found', 'Repository not found.');
  const pull = await env.DB.prepare(
    `SELECT id,locked_at AS lockedAt FROM pull_requests WHERE repository_id=? AND number=?`
  )
    .bind(repository.id, number)
    .first<{ id: string; lockedAt?: string }>();
  if (!pull) return problem(404, 'pull_request_not_found', 'Pull request not found.');
  if (pull.lockedAt) return problem(423, 'conversation_locked', 'This conversation is locked.');
  const body = await readJson(request, commentBody);
  if (!body || typeof body.body !== 'string' || !body.body.trim() || body.body.length > 50_000)
    return problem(422, 'invalid_pull_comment', 'A comment is required.');
  const id = identifier('comment');
  const createdAt = new Date().toISOString();
  const comment = {
    id,
    authorId: principal.id,
    author: principal.handle,
    authorDisplayName: principal.displayName,
    authorAvatarUrl: principal.avatarUrl,
    authorKind: principal.kind,
    body: body.body.trim(),
    bodyHtml: renderBody(body.body.trim(), { owner, repository: name }, id),
    createdAt,
    updatedAt: createdAt,
    deleted: false,
    canEdit: true
  };
  const references = await referenceStatements(
    env,
    principal,
    { kind: 'pull', id: pull.id, owner, repository: name },
    'comment',
    id,
    comment.body
  );
  const mentions = await mentionStatements(
    env,
    principal,
    { kind: 'pull', id: pull.id },
    'pull_comment',
    id,
    comment.body,
    createdAt
  );
  const update = await commitPullUpdate(
    env,
    pull.id,
    'comment.created',
    { timeline: [{ kind: 'comment', value: comment, createdAt }], refreshState: true },
    [
      env.DB.prepare(
        `INSERT INTO pull_request_comments (id,pull_request_id,author_id,body,created_at,updated_at) VALUES (?,?,?,?,?,?)`
      ).bind(id, pull.id, principal.id, comment.body, createdAt, createdAt),
      ...references,
      ...mentions
    ]
  );
  return json({ comment, update }, { status: 201 });
}

export async function updatePullComment(
  request: Request,
  env: Env,
  principal: Principal,
  commentId: string
): Promise<Response> {
  const body = await readJson(request, commentBody);
  if (!body || typeof body.body !== 'string' || !body.body.trim() || body.body.length > 50_000)
    return problem(422, 'invalid_pull_comment', 'A comment is required.');
  const comment = await env.DB.prepare(
    'SELECT pull_request_comments.id,pull_requests.id AS pullId,organizations.slug AS owner,repositories.name AS repository FROM pull_request_comments JOIN pull_requests ON pull_requests.id=pull_request_comments.pull_request_id JOIN repositories ON repositories.id=pull_requests.repository_id JOIN organizations ON organizations.id=repositories.organization_id WHERE pull_request_comments.id=? AND pull_request_comments.author_id=? AND pull_request_comments.deleted_at IS NULL'
  )
    .bind(commentId, principal.id)
    .first<{ id: string; pullId: string; owner: string; repository: string }>();
  if (!comment || !(await authorizeRepository(env, principal, comment.owner, comment.repository, 'repository.read')))
    return problem(404, 'pull_comment_not_found', 'Editable comment not found.');
  const updatedAt = new Date().toISOString();
  const value = {
    id: commentId,
    body: body.body.trim(),
    bodyHtml: renderBody(body.body.trim(), { owner: comment.owner, repository: comment.repository }, commentId),
    updatedAt,
    deleted: false
  };
  const references = await referenceStatements(
    env,
    principal,
    { kind: 'pull', id: comment.pullId, owner: comment.owner, repository: comment.repository },
    'comment',
    commentId,
    value.body
  );
  const mentions = await mentionStatements(
    env,
    principal,
    { kind: 'pull', id: comment.pullId },
    'pull_comment',
    commentId,
    value.body,
    updatedAt
  );
  const update = await commitPullUpdate(
    env,
    comment.pullId,
    'comment.updated',
    { comment: value, refreshState: true },
    [
      env.DB.prepare(`UPDATE pull_request_comments SET body=?,updated_at=? WHERE id=?`).bind(
        value.body,
        updatedAt,
        commentId
      ),
      ...references,
      ...mentions
    ]
  );
  return json({ comment: value, update });
}

export async function deletePullComment(env: Env, principal: Principal, commentId: string): Promise<Response> {
  const comment = await env.DB.prepare(
    'SELECT id,pull_request_id AS pullId,author_id AS authorId FROM pull_request_comments WHERE id=? AND deleted_at IS NULL'
  )
    .bind(commentId)
    .first<{ id: string; pullId: string; authorId: string }>();
  if (!comment || !(await canDeletePullComment(env, principal, comment.pullId, comment.authorId)))
    return problem(404, 'pull_comment_not_found', 'Comment not found.');
  const updatedAt = new Date().toISOString();
  const value = { id: commentId, body: '', bodyHtml: '', updatedAt, deleted: true };
  const update = await commitPullUpdate(
    env,
    comment.pullId,
    'comment.deleted',
    { comment: value, refreshState: true },
    [
      env.DB.prepare(`UPDATE pull_request_comments SET body='',deleted_at=?,updated_at=? WHERE id=?`).bind(
        updatedAt,
        updatedAt,
        commentId
      ),
      ...deleteReferenceStatements(env, 'comment', commentId),
      ...deleteMentionStatements(env, 'pull_comment', commentId)
    ]
  );
  return json({ comment: value, update });
}
