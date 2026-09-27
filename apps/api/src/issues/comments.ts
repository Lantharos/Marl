import { emitRepositoryEvent } from '../webhooks/events';
import { renderBody } from '../core/markdown';
import type { Principal } from '../auth/principal';
import { identifier } from '../core/domain';
import { json, problem, readJson } from '../http/http';
import type { Env } from '../core/platform';
import { commentBody, issueCommentBody } from '../http/request-schemas';
import { authorizeRepository } from '../repositories/access/access';
import { deleteReferenceStatements, linkedWorkItems, referenceStatements } from './references/work-items';
import { deleteMentionStatements, mentionStatements } from './references/mentions';

export async function addIssueComment(
  request: Request,
  env: Env,
  principal: Principal,
  owner: string,
  name: string,
  number: number
): Promise<Response> {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.read');
  if (!repository) return problem(404, 'repository_not_found', 'Repository not found.');
  const issue = await env.DB.prepare('SELECT id,locked_at AS lockedAt FROM issues WHERE repository_id=? AND number=?')
    .bind(repository.id, number)
    .first<{ id: string; lockedAt: string | null }>();
  if (!issue) return problem(404, 'issue_not_found', 'Issue not found.');
  if (issue.lockedAt && !(await authorizeRepository(env, principal, owner, name, 'repository.triage')))
    return problem(423, 'issue_locked', 'This issue is locked.');
  const body = await readJson(request, issueCommentBody);
  if (!body?.body.trim()) return problem(422, 'invalid_comment', 'Comment body is required.');
  const target = body.replyToId
    ? await env.DB.prepare(
        'SELECT id,parent_id AS parentId FROM issue_comments WHERE id=? AND issue_id=? AND deleted_at IS NULL'
      )
        .bind(body.replyToId, issue.id)
        .first<{ id: string; parentId: string | null }>()
    : null;
  if (body.replyToId && !target)
    return problem(422, 'invalid_reply', 'That comment is no longer available in this issue.');
  const parentId = target ? (target.parentId ?? target.id) : null;
  const replyToId = target?.id ?? null;
  const id = identifier('comment');
  const createdAt = new Date().toISOString();
  const comment = body.body.trim();
  const references = await referenceStatements(
    env,
    principal,
    { kind: 'issue', id: issue.id, owner, repository: name },
    'comment',
    id,
    comment
  );
  const mentions = await mentionStatements(
    env,
    principal,
    { kind: 'issue', id: issue.id },
    'issue_comment',
    id,
    comment,
    createdAt
  );
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO issue_comments (id,issue_id,author_id,body,created_at,updated_at,parent_id,reply_to_id) VALUES (?,?,?,?,?,?,?,?)'
    ).bind(id, issue.id, principal.id, comment, createdAt, createdAt, parentId, replyToId),
    ...references,
    ...mentions,
    env.DB.prepare('UPDATE issues SET updated_at=? WHERE id=?').bind(createdAt, issue.id)
  ]);
  const entry = await env.DB.prepare(
    "SELECT sequence FROM issue_timeline WHERE issue_id=? AND kind='comment' AND entity_id=?"
  )
    .bind(issue.id, id)
    .first<{ sequence: number }>();
  await emitRepositoryEvent(
    env,
    repository.id,
    'comment',
    'created',
    { kind: 'comment', id, on: 'issue' },
    principal.handle
  );
  return json(
    {
      comment: {
        id,
        parentId,
        replyToId,
        authorId: principal.id,
        author: principal.handle,
        authorDisplayName: principal.displayName,
        authorAvatarUrl: principal.avatarUrl,
        authorKind: principal.kind,
        body: comment,
        bodyHtml: renderBody(comment, { owner, repository: name }, id),
        createdAt,
        updatedAt: createdAt,
        deleted: false,
        canEdit: true
      },
      sequence: entry?.sequence,
      linkedItems: await linkedWorkItems(env, principal, 'issue', issue.id)
    },
    { status: 201 }
  );
}

export async function updateIssueComment(
  request: Request,
  env: Env,
  principal: Principal,
  commentId: string
): Promise<Response> {
  const comment = await commentContext(env, principal, commentId);
  if (!comment || (!comment.canManage && comment.authorId !== principal.id))
    return problem(404, 'comment_not_found', 'Comment not found.');
  if (comment.deletedAt) return problem(409, 'comment_deleted', 'Deleted comments cannot be edited.');
  const body = await readJson(request, commentBody);
  if (!body?.body.trim()) return problem(422, 'invalid_comment', 'Comment body is required.');
  const updatedAt = new Date().toISOString();
  const value = body.body.trim();
  const references = await referenceStatements(
    env,
    principal,
    { kind: 'issue', id: comment.issueId, owner: comment.owner, repository: comment.repository },
    'comment',
    commentId,
    value
  );
  const mentions = await mentionStatements(
    env,
    principal,
    { kind: 'issue', id: comment.issueId },
    'issue_comment',
    commentId,
    value,
    updatedAt
  );
  await env.DB.batch([
    env.DB.prepare('UPDATE issue_comments SET body=?,updated_at=? WHERE id=?').bind(value, updatedAt, commentId),
    ...references,
    ...mentions
  ]);
  return json({
    comment: {
      id: commentId,
      body: value,
      bodyHtml: renderBody(value, { owner: comment.owner, repository: comment.repository }, commentId),
      updatedAt
    },
    linkedItems: await linkedWorkItems(env, principal, 'issue', comment.issueId)
  });
}

export async function deleteIssueComment(env: Env, principal: Principal, commentId: string): Promise<Response> {
  const comment = await commentContext(env, principal, commentId);
  if (!comment || (!comment.canManage && comment.authorId !== principal.id))
    return problem(404, 'comment_not_found', 'Comment not found.');
  if (comment.deletedAt) return problem(409, 'comment_deleted', 'Comment is already deleted.');
  const deletedAt = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('UPDATE issue_comments SET body=?,deleted_at=?,updated_at=? WHERE id=?').bind(
      '',
      deletedAt,
      deletedAt,
      commentId
    ),
    ...deleteReferenceStatements(env, 'comment', commentId),
    ...deleteMentionStatements(env, 'issue_comment', commentId)
  ]);
  return json({
    deleted: true,
    id: commentId,
    updatedAt: deletedAt,
    linkedItems: await linkedWorkItems(env, principal, 'issue', comment.issueId)
  });
}

async function commentContext(env: Env, principal: Principal, commentId: string) {
  const row = await env.DB.prepare(
    'SELECT issue_comments.author_id AS authorId,issue_comments.deleted_at AS deletedAt,issues.id AS issueId,organizations.slug AS owner,repositories.name AS repository FROM issue_comments JOIN issues ON issues.id=issue_comments.issue_id JOIN repositories ON repositories.id=issues.repository_id JOIN organizations ON organizations.id=repositories.organization_id WHERE issue_comments.id=?'
  )
    .bind(commentId)
    .first<{ authorId: string; deletedAt: string | null; issueId: string; owner: string; repository: string }>();
  if (!row || !(await authorizeRepository(env, principal, row.owner, row.repository, 'repository.read'))) return null;
  return {
    ...row,
    canManage:
      row.authorId === principal.id
        ? false
        : Boolean(await authorizeRepository(env, principal, row.owner, row.repository, 'repository.triage'))
  };
}
