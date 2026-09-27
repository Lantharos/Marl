import { renderBody } from '../../core/markdown';
import type { Principal } from '../../auth/principal';
import { canDeletePullComment } from './comment-access';
import { identifier, safeRepositoryPath } from '../../core/domain';
import { json, problem, readJson } from '../../http/http';
import type { Env } from '../../core/platform';
import { canManageRepository as membership, pullRepository as repo } from '../context';
import { commitPullUpdate } from '../realtime/updates';
import { commentBody, resolveThreadBody, reviewThreadBody } from '../../http/request-schemas';
import { authorizeRepository, authorizeRepositoryId } from '../../repositories/access/access';
import { deleteReferenceStatements, referenceStatements } from '../../issues/references/work-items';
import { deleteMentionStatements, mentionStatements } from '../../issues/references/mentions';

export async function createThread(
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
    `SELECT id, source_commit_id AS sourceCommitId, locked_at AS lockedAt FROM pull_requests WHERE repository_id = ? AND number = ? AND state IN ('draft','open')`
  )
    .bind(repository.id, number)
    .first<{ id: string; sourceCommitId: string; lockedAt?: string }>();
  if (!pull) return problem(409, 'pull_request_not_open', 'Pull request is not open.');
  if (pull.lockedAt) return problem(423, 'conversation_locked', 'This conversation is locked.');
  const body = await readJson(request, reviewThreadBody);
  const startSide = body?.startSide ?? body?.side;
  const startLine = body?.startLine ?? body?.line;
  if (
    !body ||
    typeof body.path !== 'string' ||
    !safeRepositoryPath(body.path) ||
    !['old', 'new'].includes(String(body.side)) ||
    startSide !== body.side ||
    !Number.isInteger(body.line) ||
    !Number.isInteger(startLine) ||
    Number(startLine) < 1 ||
    Number(startLine) > Number(body.line) ||
    typeof body.body !== 'string' ||
    !body.body.trim() ||
    body.body.length > 20_000
  )
    return problem(422, 'invalid_review_thread', 'Path, line range, side, and comment are required.');
  const threadId = identifier('thread');
  const commentId = identifier('comment');
  const createdAt = new Date().toISOString();
  const comment = {
    id: commentId,
    authorId: principal.id,
    author: principal.handle,
    authorDisplayName: principal.displayName,
    authorAvatarUrl: principal.avatarUrl,
    authorKind: principal.kind,
    body: body.body.trim(),
    bodyHtml: renderBody(body.body.trim(), { owner, repository: name }, commentId),
    createdAt,
    updatedAt: createdAt,
    deleted: false,
    canEdit: true
  };
  const thread = {
    id: threadId,
    path: body.path,
    side: body.side,
    line: body.line,
    startSide,
    startLine,
    commitId: pull.sourceCommitId,
    createdAt,
    outdated: false,
    resolved: false,
    comments: [comment]
  };
  const references = await referenceStatements(
    env,
    principal,
    { kind: 'pull', id: pull.id, owner, repository: name },
    'comment',
    commentId,
    comment.body
  );
  const mentions = await mentionStatements(
    env,
    principal,
    { kind: 'pull', id: pull.id },
    'review_comment',
    commentId,
    comment.body,
    createdAt
  );
  const update = await commitPullUpdate(
    env,
    pull.id,
    'thread.created',
    { timeline: [{ kind: 'thread', value: thread, createdAt }], refreshState: true },
    [
      env.DB.prepare(
        'INSERT INTO review_threads (id, pull_request_id, path, side, line, start_side, start_line, commit_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(threadId, pull.id, body.path, body.side, body.line, startSide, startLine, pull.sourceCommitId, createdAt),
      env.DB.prepare(
        'INSERT INTO review_comments (id, thread_id, author_id, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(commentId, threadId, principal.id, comment.body, createdAt, createdAt),
      ...references,
      ...mentions
    ]
  );
  return json({ thread, update }, { status: 201 });
}

export async function resolveThread(
  request: Request,
  env: Env,
  principal: Principal,
  threadId: string
): Promise<Response> {
  const thread = await env.DB.prepare(
    `SELECT review_threads.id,review_threads.pull_request_id AS pullId,pull_requests.repository_id AS repositoryId,review_threads.resolved_at AS resolvedAt FROM review_threads JOIN pull_requests ON pull_requests.id = review_threads.pull_request_id WHERE review_threads.id = ?`
  )
    .bind(threadId)
    .first<{ id: string; pullId: string; repositoryId: string; resolvedAt?: string }>();
  if (!thread || !(await authorizeRepositoryId(env, principal, thread.repositoryId, 'repository.maintain')))
    return problem(404, 'review_thread_not_found', 'Review thread not found.');
  const body = await readJson(request, resolveThreadBody);
  if (!body) return problem(422, 'invalid_resolution', 'Choose whether to resolve or reopen this conversation.');
  const resolved = body?.resolved !== false;
  if (resolved === Boolean(thread.resolvedAt)) return json({ resolved });
  const update = await commitPullUpdate(
    env,
    thread.pullId,
    'thread.resolved',
    { thread: { id: threadId, resolved }, refreshState: true },
    [
      resolved
        ? env.DB.prepare(
            'UPDATE review_threads SET resolved_by = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ?'
          ).bind(principal.id, threadId)
        : env.DB.prepare('UPDATE review_threads SET resolved_by = NULL, resolved_at = NULL WHERE id = ?').bind(threadId)
    ]
  );
  return json({ resolved, update });
}

export async function addThreadComment(
  request: Request,
  env: Env,
  principal: Principal,
  threadId: string
): Promise<Response> {
  const thread = await env.DB.prepare(
    `SELECT review_threads.id,review_threads.pull_request_id AS pullId,pull_requests.repository_id AS repositoryId,organizations.slug AS owner,repositories.name AS repository FROM review_threads JOIN pull_requests ON pull_requests.id=review_threads.pull_request_id JOIN repositories ON repositories.id=pull_requests.repository_id JOIN organizations ON organizations.id=repositories.organization_id WHERE review_threads.id=? AND pull_requests.state IN ('draft','open') AND pull_requests.locked_at IS NULL`
  )
    .bind(threadId)
    .first<{ id: string; pullId: string; repositoryId: string; owner: string; repository: string }>();
  if (!thread || !(await authorizeRepositoryId(env, principal, thread.repositoryId, 'repository.triage')))
    return problem(404, 'review_thread_not_found', 'Review conversation not found.');
  const body = await readJson(request, commentBody);
  if (!body || typeof body.body !== 'string' || !body.body.trim() || body.body.length > 20_000)
    return problem(422, 'invalid_review_comment', 'A review comment is required.');
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
    bodyHtml: renderBody(body.body.trim(), { owner: thread.owner, repository: thread.repository }, id),
    createdAt,
    updatedAt: createdAt,
    deleted: false,
    canEdit: true
  };
  const references = await referenceStatements(
    env,
    principal,
    { kind: 'pull', id: thread.pullId, owner: thread.owner, repository: thread.repository },
    'comment',
    id,
    comment.body
  );
  const mentions = await mentionStatements(
    env,
    principal,
    { kind: 'pull', id: thread.pullId },
    'review_comment',
    id,
    comment.body,
    createdAt
  );
  const update = await commitPullUpdate(
    env,
    thread.pullId,
    'thread.comment.created',
    { threadComment: { threadId, comment }, refreshState: true },
    [
      env.DB.prepare(
        'INSERT INTO review_comments (id,thread_id,author_id,body,created_at,updated_at) VALUES (?,?,?,?,?,?)'
      ).bind(id, threadId, principal.id, comment.body, createdAt, createdAt),
      ...references,
      ...mentions
    ]
  );
  return json({ comment, update }, { status: 201 });
}

export async function updateReviewComment(
  request: Request,
  env: Env,
  principal: Principal,
  commentId: string
): Promise<Response> {
  const body = await readJson(request, commentBody);
  if (!body || typeof body.body !== 'string' || !body.body.trim() || body.body.length > 20_000)
    return problem(422, 'invalid_review_comment', 'A review comment is required.');
  const comment = await env.DB.prepare(
    `SELECT review_comments.id,review_comments.thread_id AS threadId,review_threads.pull_request_id AS pullId,organizations.slug AS owner,repositories.name AS repository FROM review_comments JOIN review_threads ON review_threads.id=review_comments.thread_id JOIN pull_requests ON pull_requests.id=review_threads.pull_request_id JOIN repositories ON repositories.id=pull_requests.repository_id JOIN organizations ON organizations.id=repositories.organization_id WHERE review_comments.id=? AND review_comments.author_id=? AND review_comments.deleted_at IS NULL`
  )
    .bind(commentId, principal.id)
    .first<{ id: string; threadId: string; pullId: string; owner: string; repository: string }>();
  if (!comment || !(await authorizeRepository(env, principal, comment.owner, comment.repository, 'repository.read')))
    return problem(404, 'review_comment_not_found', 'Editable review comment not found.');
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
    'review_comment',
    commentId,
    value.body,
    updatedAt
  );
  const update = await commitPullUpdate(
    env,
    comment.pullId,
    'thread.comment.updated',
    { threadComment: { threadId: comment.threadId, comment: value }, refreshState: true },
    [
      env.DB.prepare(`UPDATE review_comments SET body=?,updated_at=? WHERE id=?`).bind(
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

export async function deleteReviewComment(env: Env, principal: Principal, commentId: string): Promise<Response> {
  const comment = await env.DB.prepare(
    `SELECT review_comments.id,review_comments.thread_id AS threadId,review_threads.pull_request_id AS pullId,review_comments.author_id AS authorId FROM review_comments JOIN review_threads ON review_threads.id=review_comments.thread_id WHERE review_comments.id=? AND review_comments.deleted_at IS NULL`
  )
    .bind(commentId)
    .first<{ id: string; threadId: string; pullId: string; authorId: string }>();
  if (!comment || !(await canDeletePullComment(env, principal, comment.pullId, comment.authorId)))
    return problem(404, 'review_comment_not_found', 'Review comment not found.');
  const updatedAt = new Date().toISOString();
  const value = { id: commentId, body: '', bodyHtml: '', updatedAt, deleted: true };
  const update = await commitPullUpdate(
    env,
    comment.pullId,
    'thread.comment.deleted',
    { threadComment: { threadId: comment.threadId, comment: value }, refreshState: true },
    [
      env.DB.prepare(`UPDATE review_comments SET body='',deleted_at=?,updated_at=? WHERE id=?`).bind(
        updatedAt,
        updatedAt,
        commentId
      ),
      ...deleteReferenceStatements(env, 'comment', commentId),
      ...deleteMentionStatements(env, 'review_comment', commentId)
    ]
  );
  return json({ comment: value, update });
}
