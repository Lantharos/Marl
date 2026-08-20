import type { Principal } from './auth';
import { auditStatement } from './audit';
import { branchRuleFor, type MergeMethod } from './branch-rules';
import { identifier, safeRepositoryPath, validBranchName } from './domain';
import { pinPullRefs, requestGatewayWrite } from './git-writes';
import { json, problem, readJson } from './http';
import type { Env } from './platform';
import { canManageRepository as membership, createPullEvent, latestReviews, preservePullRefs, pullCommits, pullRepository as repo, pullSelect, pullSummary as summary, type PullRow } from './pull-context';
import { mergeRequirements } from './pull-requirements';
import { commitPullUpdate } from './pull-realtime';
import { commentBody, createPullBody, createPullLabelBody, mergeBody, pullMetadataBody, resolveThreadBody, reviewBody, reviewThreadBody, updatePullBody } from './request-schemas';
import { authorizeRepository, authorizeRepositoryId } from './repository-access';

export async function createPull(request: Request, env: Env, principal: Principal, owner: string, name: string): Promise<Response> {
  const repository = await repo(env, owner, name);
  if (!repository || !(await authorizeRepository(env, principal, owner, name, 'repository.read'))) return problem(404, 'repository_not_found', 'Repository not found.');
  const body = await readJson(request, createPullBody);
  if (!body || typeof body.title !== 'string' || body.title.trim().length < 3 || body.title.length > 240 || !validBranchName(body.sourceBranch) || !validBranchName(body.targetBranch)) return problem(422, 'invalid_pull_request', 'Title and valid source and target branches are required.');
  const sourceParts = body.sourceRepository?.split('/') ?? [owner, name];
  if (sourceParts.length !== 2) return problem(422, 'invalid_source_repository', 'Choose a valid source repository.');
  const [sourceOwner, sourceName] = sourceParts;
  const sourceRepository = await repo(env, sourceOwner, sourceName);
  if (!sourceRepository || !(await authorizeRepository(env, principal, sourceOwner, sourceName, 'repository.push'))) return problem(404, 'source_repository_not_found', 'Source repository not found.');
  const sameRepository = sourceRepository.id === repository.id;
  if (sameRepository && !(await membership(env, principal, repository))) return problem(404, 'repository_not_found', 'Repository not found.');
  if ((await forkRoot(env, sourceRepository.id)) !== (await forkRoot(env, repository.id))) return problem(422, 'unrelated_repositories', 'Pull requests can only cross repositories in the same fork network.');
  if (sameRepository && body.sourceBranch === body.targetBranch) return problem(422, 'invalid_pull_request', 'Choose two different branches.');
  const [source, target] = await Promise.all([
    env.DB.prepare('SELECT name,commit_id AS commitId FROM branches WHERE repository_id=? AND name=?').bind(sourceRepository.id, body.sourceBranch).first<{ name: string; commitId: string }>(),
    env.DB.prepare('SELECT name,commit_id AS commitId FROM branches WHERE repository_id=? AND name=?').bind(repository.id, body.targetBranch).first<{ name: string; commitId: string }>()
  ]);
  if (!source || !target) return problem(422, 'branch_not_found', 'Source or target branch does not exist.');
  const duplicate = await env.DB.prepare(`SELECT number FROM pull_requests WHERE repository_id=? AND COALESCE(source_repository_id,repository_id)=? AND source_branch=? AND target_branch=? AND state IN ('draft','open')`).bind(repository.id, sourceRepository.id, body.sourceBranch, body.targetBranch).first<{ number: number }>();
  if (duplicate) {
    const existing = await env.DB.prepare(`${pullSelect} WHERE pull_requests.repository_id = ? AND pull_requests.number = ?`).bind(repository.id, duplicate.number).first<PullRow>();
    if (!existing) return problem(409, 'pull_request_exists', `Pull request #${duplicate.number} already proposes this branch.`);
    const pinned = await preservePullRefs(env, repository, existing);
    if (pinned) return pinned;
    return json({ pullRequest: summary(existing) });
  }
  const id = identifier('pr');
  const state = body.draft === true ? 'draft' : 'open';
  const commits = await pullCommits(env, repository.id, sourceRepository.id, source.commitId, target.commitId);
  const commitEvent = commits.results.length ? createPullEvent(env, id, principal, 'commits_added', { commits: JSON.stringify(commits.results.map((commit) => ({ id: commit.id, title: commit.title }))), owner: sourceOwner, repository: sourceName }) : null;
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO pull_requests (id,repository_id,source_repository_id,number,title,body,author_id,source_branch,target_branch,source_commit_id,target_commit_id,state) SELECT ?,?,?,COALESCE(MAX(number),0)+1,?,?,?,?,?,?,?,? FROM pull_requests WHERE repository_id=?`).bind(id, repository.id, sameRepository ? null : sourceRepository.id, body.title.trim(), typeof body.body === 'string' ? body.body.slice(0, 100_000) : '', principal.id, body.sourceBranch, body.targetBranch, source.commitId, target.commitId, state, repository.id),
    ...(commitEvent ? [commitEvent.statement] : []),
    auditStatement(env, { organizationId: repository.organizationId, repositoryId: repository.id, actor: principal, action: 'pull.created', subjectType: 'pull_request', subjectId: id, details: { sourceRepository: `${sourceOwner}/${sourceName}`, sourceBranch: body.sourceBranch, targetBranch: body.targetBranch, state } })
  ]);
  const created = await env.DB.prepare(`${pullSelect} WHERE pull_requests.id = ?`).bind(id).first<PullRow>();
  if (!created) return problem(500, 'pull_request_create_failed', 'Pull request creation did not persist.');
  const pinned = await preservePullRefs(env, repository, created);
  if (pinned) return pinned;
  return json({ pullRequest: created && summary(created) }, { status: 201 });
}

async function forkRoot(env: Env, repositoryId: string) {
  const row = await env.DB.prepare('SELECT COALESCE(fork_root_repository_id,id) AS rootId FROM repositories WHERE id=?').bind(repositoryId).first<{ rootId: string }>();
  return row?.rootId ?? '';
}


export async function updatePullDetails(request: Request, env: Env, principal: Principal, owner: string, name: string, number: number): Promise<Response> {
  const repository = await repo(env, owner, name);
  if (!repository || !(await membership(env, principal, repository))) return problem(404, 'repository_not_found', 'Repository not found.');
  const pull = await env.DB.prepare('SELECT id,title,body FROM pull_requests WHERE repository_id=? AND number=?').bind(repository.id, number).first<{ id: string; title: string; body: string }>();
  if (!pull) return problem(404, 'pull_request_not_found', 'Pull request not found.');
  const body = await readJson(request, updatePullBody);
  if (!body) return problem(400, 'invalid_json', 'Expected a JSON request body.');
  const title = body.title === undefined ? pull.title : typeof body.title === 'string' ? body.title.trim() : '';
  const description = body.body === undefined ? pull.body : typeof body.body === 'string' ? body.body.trim() : '';
  if (title.length < 3 || title.length > 240 || description.length > 100_000) return problem(422, 'invalid_pull_request', 'Title and description are invalid.');
  const events: ReturnType<typeof createPullEvent>[] = [];
  if (title !== pull.title) events.push(createPullEvent(env, pull.id, principal, 'title_changed', { from: pull.title, to: title }));
  if (description !== pull.body) events.push(createPullEvent(env, pull.id, principal, 'description_changed'));
  const statements = events.map((event) => event.statement);
  if (!statements.length) return problem(422, 'unchanged_pull_request', 'No pull request details changed.');
  statements.unshift(env.DB.prepare('UPDATE pull_requests SET title=?,body=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(title, description, pull.id));
  const update = await commitPullUpdate(env, pull.id, 'details.updated', { details: { title, body: description }, timeline: events.map((event) => ({ kind: 'event', value: event.value, createdAt: event.value.createdAt })) }, statements);
  return json({ updated: true, pull: { title, body: description }, update });
}

export async function updatePullMetadata(request: Request, env: Env, principal: Principal, owner: string, name: string, number: number): Promise<Response> {
  const repository = await repo(env, owner, name);
  if (!repository || !(await membership(env, principal, repository))) return problem(404, 'repository_not_found', 'Repository not found.');
  const pull = await env.DB.prepare('SELECT id,locked_at AS lockedAt FROM pull_requests WHERE repository_id=? AND number=?').bind(repository.id, number).first<{ id: string; lockedAt?: string }>();
  if (!pull) return problem(404, 'pull_request_not_found', 'Pull request not found.');
  const body = await readJson(request, pullMetadataBody);
  if (!body) return problem(400, 'invalid_json', 'Expected a JSON request body.');
  const [members, repositoryLabels, currentAssignees, currentLabels] = await Promise.all([
    env.DB.prepare(`SELECT users.id,users.handle FROM users JOIN organization_members ON organization_members.user_id=users.id WHERE organization_members.organization_id=?`).bind(repository.organizationId).all<{ id: string; handle: string }>(),
    env.DB.prepare('SELECT id,name FROM repository_labels WHERE repository_id=?').bind(repository.id).all<{ id: string; name: string }>(),
    env.DB.prepare('SELECT user_id AS id FROM pull_request_assignees WHERE pull_request_id=?').bind(pull.id).all<{ id: string }>(),
    env.DB.prepare('SELECT label_id AS id FROM pull_request_labels WHERE pull_request_id=?').bind(pull.id).all<{ id: string }>()
  ]);
  const memberNames = new Map(members.results.map((member) => [member.id, member.handle]));
  const labelNames = new Map(repositoryLabels.results.map((label) => [label.id, label.name]));
  const statements = [];
  const events: ReturnType<typeof createPullEvent>[] = [];
  const addEvent = (kind: string, details: Record<string, string> = {}) => {
    const event = createPullEvent(env, pull.id, principal, kind, details);
    events.push(event);
    statements.push(event.statement);
  };
  if (body.assigneeIds !== undefined) {
    if (!Array.isArray(body.assigneeIds) || body.assigneeIds.length > 10 || body.assigneeIds.some((id: unknown) => typeof id !== 'string')) return problem(422, 'invalid_assignees', 'Choose up to ten repository members.');
    const ids = [...new Set(body.assigneeIds as string[])];
    if (ids.some((id) => !memberNames.has(id))) return problem(422, 'invalid_assignees', 'Every assignee must belong to this repository organization.');
    const previous = new Set(currentAssignees.results.map((item) => item.id));
    const next = new Set(ids);
    if (ids.some((id) => !previous.has(id)) || [...previous].some((id) => !next.has(id))) {
      statements.push(env.DB.prepare('DELETE FROM pull_request_assignees WHERE pull_request_id=?').bind(pull.id));
      for (const id of ids) statements.push(env.DB.prepare('INSERT INTO pull_request_assignees (pull_request_id,user_id) VALUES (?,?)').bind(pull.id, id));
      for (const id of ids.filter((id) => !previous.has(id))) addEvent('assigned', { handle: memberNames.get(id) ?? id });
      for (const id of [...previous].filter((id) => !next.has(id))) addEvent('unassigned', { handle: memberNames.get(id) ?? id });
    }
  }
  if (body.labelIds !== undefined) {
    if (!Array.isArray(body.labelIds) || body.labelIds.length > 20 || body.labelIds.some((id: unknown) => typeof id !== 'string')) return problem(422, 'invalid_labels', 'Choose up to twenty repository labels.');
    const ids = [...new Set(body.labelIds as string[])];
    if (ids.some((id) => !labelNames.has(id))) return problem(422, 'invalid_labels', 'Every label must belong to this repository.');
    const previous = new Set(currentLabels.results.map((item) => item.id));
    const next = new Set(ids);
    if (ids.some((id) => !previous.has(id)) || [...previous].some((id) => !next.has(id))) {
      statements.push(env.DB.prepare('DELETE FROM pull_request_labels WHERE pull_request_id=?').bind(pull.id));
      for (const id of ids) statements.push(env.DB.prepare('INSERT INTO pull_request_labels (pull_request_id,label_id) VALUES (?,?)').bind(pull.id, id));
      for (const id of ids.filter((id) => !previous.has(id))) addEvent('label_added', { label: labelNames.get(id) ?? id });
      for (const id of [...previous].filter((id) => !next.has(id))) addEvent('label_removed', { label: labelNames.get(id) ?? id });
    }
  }
  if (body.locked !== undefined) {
    if (typeof body.locked !== 'boolean') return problem(422, 'invalid_lock_state', 'Conversation lock state must be a boolean.');
    if (body.locked !== Boolean(pull.lockedAt)) {
      statements.push(env.DB.prepare('UPDATE pull_requests SET locked_at=?,locked_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(body.locked ? new Date().toISOString() : null, body.locked ? principal.id : null, pull.id));
      addEvent(body.locked ? 'locked' : 'unlocked');
    }
  }
  if (!statements.length) return json({ updated: false });
  const assigneeIds = body.assigneeIds === undefined ? currentAssignees.results.map((item) => item.id) : [...new Set(body.assigneeIds as string[])];
  const labelIds = body.labelIds === undefined ? currentLabels.results.map((item) => item.id) : [...new Set(body.labelIds as string[])];
  const locked = body.locked === undefined ? Boolean(pull.lockedAt) : body.locked;
  const update = await commitPullUpdate(env, pull.id, 'metadata.updated', { metadata: { assigneeIds, labelIds, locked }, timeline: events.map((event) => ({ kind: 'event', value: event.value, createdAt: event.value.createdAt })) }, statements);
  return json({ updated: true, metadata: { assigneeIds, labelIds, locked }, update });
}

const labelColors = ['#e16f73', '#d58b5f', '#d3a45f', '#77a86b', '#68a7b8', '#668fc7', '#8c7ad8', '#bd6f9c'];

function colorForLabel(name: string) {
  let hash = 0;
  for (const character of name) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return labelColors[Math.abs(hash) % labelColors.length];
}

export async function createPullLabel(request: Request, env: Env, principal: Principal, owner: string, name: string, number: number): Promise<Response> {
  const repository = await repo(env, owner, name);
  if (!repository || !(await membership(env, principal, repository))) return problem(404, 'repository_not_found', 'Repository not found.');
  const pull = await env.DB.prepare('SELECT id FROM pull_requests WHERE repository_id=? AND number=?').bind(repository.id, number).first<{ id: string }>();
  if (!pull) return problem(404, 'pull_request_not_found', 'Pull request not found.');
  const body = await readJson(request, createPullLabelBody);
  const labelName = body?.name.trim().replace(/\s+/g, ' ') ?? '';
  if (!labelName || /[\u0000-\u001f\u007f]/.test(labelName)) return problem(422, 'invalid_label', 'Enter a valid label name.');

  const existing = await env.DB.prepare('SELECT id,name,color,description FROM repository_labels WHERE repository_id=? AND name=? COLLATE NOCASE').bind(repository.id, labelName).first<{ id: string; name: string; color: string; description: string }>();
  const label = existing ?? { id: identifier('label'), name: labelName, color: colorForLabel(labelName), description: '' };
  const current = await env.DB.prepare('SELECT label_id AS id FROM pull_request_labels WHERE pull_request_id=?').bind(pull.id).all<{ id: string }>();
  if (current.results.some((item) => item.id === label.id)) return json({ label, applied: false });
  if (current.results.length >= 20) return problem(422, 'too_many_labels', 'A pull request can have up to twenty labels.');

  const labelIds = [...current.results.map((item) => item.id), label.id];
  const event = createPullEvent(env, pull.id, principal, 'label_added', { label: label.name });
  const statements = [
    ...(!existing ? [
      env.DB.prepare('INSERT INTO repository_labels (id,repository_id,name,color,description) VALUES (?,?,?,?,?)').bind(label.id, repository.id, label.name, label.color, label.description),
      auditStatement(env, { organizationId: repository.organizationId, repositoryId: repository.id, actor: principal, action: 'repository.label_created', subjectType: 'repository_label', subjectId: label.id, details: { name: label.name } })
    ] : []),
    env.DB.prepare('INSERT INTO pull_request_labels (pull_request_id,label_id) VALUES (?,?)').bind(pull.id, label.id),
    event.statement
  ];
  const update = await commitPullUpdate(env, pull.id, 'label.created', { label, metadata: { labelIds }, timeline: [{ kind: 'event', value: event.value, createdAt: event.value.createdAt }] }, statements);
  return json({ label, applied: true, update }, { status: existing ? 200 : 201 });
}

export async function addPullComment(request: Request, env: Env, principal: Principal, owner: string, name: string, number: number): Promise<Response> {
  const repository = await repo(env, owner, name);
  if (!repository || !(await membership(env, principal, repository))) return problem(404, 'repository_not_found', 'Repository not found.');
  const pull = await env.DB.prepare(`SELECT id,locked_at AS lockedAt FROM pull_requests WHERE repository_id=? AND number=?`).bind(repository.id, number).first<{ id: string; lockedAt?: string }>();
  if (!pull) return problem(404, 'pull_request_not_found', 'Pull request not found.');
  if (pull.lockedAt) return problem(423, 'conversation_locked', 'This conversation is locked.');
  const body = await readJson(request, commentBody);
  if (!body || typeof body.body !== 'string' || !body.body.trim() || body.body.length > 50_000) return problem(422, 'invalid_pull_comment', 'A comment is required.');
  const id = identifier('comment');
  const createdAt = new Date().toISOString();
  const comment = { id, authorId: principal.id, author: principal.handle, authorDisplayName: principal.displayName, authorAvatarUrl: principal.avatarUrl, body: body.body.trim(), createdAt, updatedAt: createdAt, deleted: false, canEdit: true };
  const update = await commitPullUpdate(env, pull.id, 'comment.created', { timeline: [{ kind: 'comment', value: comment, createdAt }] }, [
    env.DB.prepare(`INSERT INTO pull_request_comments (id,pull_request_id,author_id,body,created_at,updated_at) VALUES (?,?,?,?,?,?)`).bind(id, pull.id, principal.id, comment.body, createdAt, createdAt)
  ]);
  return json({ comment, update }, { status: 201 });
}

export async function updatePullComment(request: Request, env: Env, principal: Principal, commentId: string): Promise<Response> {
  const body = await readJson(request, commentBody);
  if (!body || typeof body.body !== 'string' || !body.body.trim() || body.body.length > 50_000) return problem(422, 'invalid_pull_comment', 'A comment is required.');
  const comment = await env.DB.prepare('SELECT id,pull_request_id AS pullId FROM pull_request_comments WHERE id=? AND author_id=? AND deleted_at IS NULL').bind(commentId, principal.id).first<{ id: string; pullId: string }>();
  if (!comment) return problem(404, 'pull_comment_not_found', 'Editable comment not found.');
  const updatedAt = new Date().toISOString();
  const value = { id: commentId, body: body.body.trim(), updatedAt, deleted: false };
  const update = await commitPullUpdate(env, comment.pullId, 'comment.updated', { comment: value }, [
    env.DB.prepare(`UPDATE pull_request_comments SET body=?,updated_at=? WHERE id=?`).bind(value.body, updatedAt, commentId)
  ]);
  return json({ comment: value, update });
}

export async function deletePullComment(env: Env, principal: Principal, commentId: string): Promise<Response> {
  const comment = await env.DB.prepare('SELECT id,pull_request_id AS pullId FROM pull_request_comments WHERE id=? AND author_id=? AND deleted_at IS NULL').bind(commentId, principal.id).first<{ id: string; pullId: string }>();
  if (!comment) return problem(404, 'pull_comment_not_found', 'Comment not found.');
  const updatedAt = new Date().toISOString();
  const value = { id: commentId, body: '', updatedAt, deleted: true };
  const update = await commitPullUpdate(env, comment.pullId, 'comment.deleted', { comment: value }, [
    env.DB.prepare(`UPDATE pull_request_comments SET body='',deleted_at=?,updated_at=? WHERE id=?`).bind(updatedAt, updatedAt, commentId)
  ]);
  return json({ comment: value, update });
}


export async function createThread(request: Request, env: Env, principal: Principal, owner: string, name: string, number: number): Promise<Response> {
  const repository = await repo(env, owner, name);
  if (!repository || !(await membership(env, principal, repository))) return problem(404, 'repository_not_found', 'Repository not found.');
  const pull = await env.DB.prepare(`SELECT id, source_commit_id AS sourceCommitId, locked_at AS lockedAt FROM pull_requests WHERE repository_id = ? AND number = ? AND state IN ('draft','open')`).bind(repository.id, number).first<{ id: string; sourceCommitId: string; lockedAt?: string }>();
  if (!pull) return problem(409, 'pull_request_not_open', 'Pull request is not open.');
  if (pull.lockedAt) return problem(423, 'conversation_locked', 'This conversation is locked.');
  const body = await readJson(request, reviewThreadBody);
  const startSide = body?.startSide ?? body?.side;
  const startLine = body?.startLine ?? body?.line;
  if (!body || typeof body.path !== 'string' || !safeRepositoryPath(body.path) || !['old', 'new'].includes(String(body.side)) || startSide !== body.side || !Number.isInteger(body.line) || !Number.isInteger(startLine) || Number(startLine) < 1 || Number(startLine) > Number(body.line) || typeof body.body !== 'string' || !body.body.trim() || body.body.length > 20_000) return problem(422, 'invalid_review_thread', 'Path, line range, side, and comment are required.');
  const threadId = identifier('thread'); const commentId = identifier('comment');
  const createdAt = new Date().toISOString();
  const comment = { id: commentId, authorId: principal.id, author: principal.handle, authorDisplayName: principal.displayName, authorAvatarUrl: principal.avatarUrl, body: body.body.trim(), createdAt, updatedAt: createdAt, deleted: false, canEdit: true };
  const thread = { id: threadId, path: body.path, side: body.side, line: body.line, startSide, startLine, commitId: pull.sourceCommitId, createdAt, outdated: false, resolved: false, comments: [comment] };
  const update = await commitPullUpdate(env, pull.id, 'thread.created', { timeline: [{ kind: 'thread', value: thread, createdAt }], refreshState: true }, [
    env.DB.prepare('INSERT INTO review_threads (id, pull_request_id, path, side, line, start_side, start_line, commit_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(threadId, pull.id, body.path, body.side, body.line, startSide, startLine, pull.sourceCommitId, createdAt),
    env.DB.prepare('INSERT INTO review_comments (id, thread_id, author_id, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(commentId, threadId, principal.id, comment.body, createdAt, createdAt)
  ]);
  return json({ thread, update }, { status: 201 });
}

export async function resolveThread(request: Request, env: Env, principal: Principal, threadId: string): Promise<Response> {
  const thread = await env.DB.prepare(`SELECT review_threads.id,review_threads.pull_request_id AS pullId,pull_requests.repository_id AS repositoryId,review_threads.path,COALESCE(review_threads.start_line,review_threads.line) AS startLine,review_threads.line,review_threads.resolved_at AS resolvedAt FROM review_threads JOIN pull_requests ON pull_requests.id = review_threads.pull_request_id WHERE review_threads.id = ?`).bind(threadId).first<{ id: string; pullId: string; repositoryId: string; path: string; startLine: number; line: number; resolvedAt?: string }>();
  if (!thread || !(await authorizeRepositoryId(env, principal, thread.repositoryId, 'repository.triage'))) return problem(404, 'review_thread_not_found', 'Review thread not found.');
  const body = await readJson(request, resolveThreadBody);
  const resolved = body?.resolved !== false;
  if (resolved === Boolean(thread.resolvedAt)) return json({ resolved });
  const event = createPullEvent(env, thread.pullId, principal, resolved ? 'thread_resolved' : 'thread_reopened', { path: thread.path, lines: thread.startLine === thread.line ? String(thread.line) : `${thread.startLine}–${thread.line}` });
  const update = await commitPullUpdate(env, thread.pullId, 'thread.resolved', { thread: { id: threadId, resolved }, timeline: [{ kind: 'event', value: event.value, createdAt: event.value.createdAt }], refreshState: true }, [
    resolved
      ? env.DB.prepare('UPDATE review_threads SET resolved_by = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ?').bind(principal.id, threadId)
      : env.DB.prepare('UPDATE review_threads SET resolved_by = NULL, resolved_at = NULL WHERE id = ?').bind(threadId),
    event.statement
  ]);
  return json({ resolved, update });
}

export async function addThreadComment(request: Request, env: Env, principal: Principal, threadId: string): Promise<Response> {
  const thread = await env.DB.prepare(`SELECT review_threads.id,review_threads.pull_request_id AS pullId,pull_requests.repository_id AS repositoryId FROM review_threads JOIN pull_requests ON pull_requests.id=review_threads.pull_request_id WHERE review_threads.id=? AND pull_requests.state IN ('draft','open') AND pull_requests.locked_at IS NULL`).bind(threadId).first<{ id: string; pullId: string; repositoryId: string }>();
  if (!thread || !(await authorizeRepositoryId(env, principal, thread.repositoryId, 'repository.triage'))) return problem(404, 'review_thread_not_found', 'Review conversation not found.');
  const body = await readJson(request, commentBody);
  if (!body || typeof body.body !== 'string' || !body.body.trim() || body.body.length > 20_000) return problem(422, 'invalid_review_comment', 'A review comment is required.');
  const id = identifier('comment');
  const createdAt = new Date().toISOString();
  const comment = { id, authorId: principal.id, author: principal.handle, authorDisplayName: principal.displayName, authorAvatarUrl: principal.avatarUrl, body: body.body.trim(), createdAt, updatedAt: createdAt, deleted: false, canEdit: true };
  const update = await commitPullUpdate(env, thread.pullId, 'thread.comment.created', { threadComment: { threadId, comment } }, [
    env.DB.prepare('INSERT INTO review_comments (id,thread_id,author_id,body,created_at,updated_at) VALUES (?,?,?,?,?,?)').bind(id, threadId, principal.id, comment.body, createdAt, createdAt)
  ]);
  return json({ comment, update }, { status: 201 });
}

export async function updateReviewComment(request: Request, env: Env, principal: Principal, commentId: string): Promise<Response> {
  const body = await readJson(request, commentBody);
  if (!body || typeof body.body !== 'string' || !body.body.trim() || body.body.length > 20_000) return problem(422, 'invalid_review_comment', 'A review comment is required.');
  const comment = await env.DB.prepare(`SELECT review_comments.id,review_comments.thread_id AS threadId,review_threads.pull_request_id AS pullId FROM review_comments JOIN review_threads ON review_threads.id=review_comments.thread_id WHERE review_comments.id=? AND review_comments.author_id=? AND review_comments.deleted_at IS NULL`).bind(commentId, principal.id).first<{ id: string; threadId: string; pullId: string }>();
  if (!comment) return problem(404, 'review_comment_not_found', 'Editable review comment not found.');
  const updatedAt = new Date().toISOString();
  const value = { id: commentId, body: body.body.trim(), updatedAt, deleted: false };
  const update = await commitPullUpdate(env, comment.pullId, 'thread.comment.updated', { threadComment: { threadId: comment.threadId, comment: value } }, [
    env.DB.prepare(`UPDATE review_comments SET body=?,updated_at=? WHERE id=?`).bind(value.body, updatedAt, commentId)
  ]);
  return json({ comment: value, update });
}

export async function deleteReviewComment(env: Env, principal: Principal, commentId: string): Promise<Response> {
  const comment = await env.DB.prepare(`SELECT review_comments.id,review_comments.thread_id AS threadId,review_threads.pull_request_id AS pullId FROM review_comments JOIN review_threads ON review_threads.id=review_comments.thread_id WHERE review_comments.id=? AND review_comments.author_id=? AND review_comments.deleted_at IS NULL`).bind(commentId, principal.id).first<{ id: string; threadId: string; pullId: string }>();
  if (!comment) return problem(404, 'review_comment_not_found', 'Review comment not found.');
  const updatedAt = new Date().toISOString();
  const value = { id: commentId, body: '', updatedAt, deleted: true };
  const update = await commitPullUpdate(env, comment.pullId, 'thread.comment.deleted', { threadComment: { threadId: comment.threadId, comment: value } }, [
    env.DB.prepare(`UPDATE review_comments SET body='',deleted_at=?,updated_at=? WHERE id=?`).bind(updatedAt, updatedAt, commentId)
  ]);
  return json({ comment: value, update });
}

export async function transitionPull(env: Env, principal: Principal, owner: string, name: string, number: number, action: 'ready' | 'close' | 'reopen'): Promise<Response> {
  const repository = await repo(env, owner, name);
  if (!repository || !(await membership(env, principal, repository))) return problem(404, 'repository_not_found', 'Repository not found.');
  const pull = await env.DB.prepare(`${pullSelect} WHERE pull_requests.repository_id=? AND pull_requests.number=?`).bind(repository.id, number).first<PullRow>();
  if (!pull) return problem(404, 'pull_request_not_found', 'Pull request not found.');
  if (action === 'ready') {
    if (pull.state !== 'draft') return problem(409, 'pull_request_not_draft', 'Only a draft pull request can be marked ready.');
    const event = createPullEvent(env, pull.id, principal, 'ready');
    const update = await commitPullUpdate(env, pull.id, 'pull.ready', { pull: { state: 'open' }, timeline: [{ kind: 'event', value: event.value, createdAt: event.value.createdAt }], refreshState: true }, [env.DB.prepare(`UPDATE pull_requests SET state='open',updated_at=CURRENT_TIMESTAMP WHERE id=? AND state='draft'`).bind(pull.id), event.statement]);
    return json({ state: 'open', update });
  }
  if (action === 'close') {
    if (!['draft', 'open'].includes(pull.state)) return problem(409, 'pull_request_not_open', 'Only an open pull request can be closed.');
    const event = createPullEvent(env, pull.id, principal, 'closed');
    const update = await commitPullUpdate(env, pull.id, 'pull.closed', { pull: { state: 'closed' }, timeline: [{ kind: 'event', value: event.value, createdAt: event.value.createdAt }], refreshState: true }, [env.DB.prepare(`UPDATE pull_requests SET state='closed',updated_at=CURRENT_TIMESTAMP WHERE id=? AND state IN ('draft','open')`).bind(pull.id), event.statement]);
    return json({ state: 'closed', update });
  }
  if (pull.state !== 'closed') return problem(409, 'pull_request_not_closed', 'Only a closed pull request can be reopened.');
  const [source, target] = await Promise.all([
    env.DB.prepare('SELECT name,commit_id AS commitId FROM branches WHERE repository_id=? AND name=?').bind(pull.sourceRepositoryId ?? repository.id, pull.sourceBranch).first<{ name: string; commitId: string }>(),
    env.DB.prepare('SELECT name,commit_id AS commitId FROM branches WHERE repository_id=? AND name=?').bind(repository.id, pull.targetBranch).first<{ name: string; commitId: string }>()
  ]);
  if (!source || !target) return problem(409, 'branch_missing', 'Both pull request branches must exist before reopening.');
  const duplicate = await env.DB.prepare(`SELECT number FROM pull_requests WHERE repository_id=? AND COALESCE(source_repository_id,repository_id)=? AND source_branch=? AND target_branch=? AND state IN ('draft','open') AND id!=?`).bind(repository.id, pull.sourceRepositoryId ?? repository.id, pull.sourceBranch, pull.targetBranch, pull.id).first<{ number: number }>();
  if (duplicate) return problem(409, 'pull_request_exists', `Pull request #${duplicate.number} already proposes this branch.`);
  const pinned = await pinPullRefs(env, { owner, repository: name, number, sourceCommitId: source.commitId, targetCommitId: target.commitId, expectedSourceCommitId: pull.sourceCommitId, expectedTargetCommitId: pull.targetCommitId, ...(pull.sourceRepositoryId ? { sourceOwner: pull.sourceOwner, sourceRepository: pull.sourceRepository, sourceRepositoryId: pull.sourceRepositoryId } : {}) });
  if (!pinned.ok) return problem(502, 'pull_ref_sync_failed', 'Pull request commits could not be preserved while reopening.');
  const event = createPullEvent(env, pull.id, principal, 'reopened');
  const pullPatch = { state: 'open', sourceCommitId: source.commitId, targetCommitId: target.commitId };
  const update = await commitPullUpdate(env, pull.id, 'pull.reopened', { pull: pullPatch, timeline: [{ kind: 'event', value: event.value, createdAt: event.value.createdAt }], refreshState: true }, [env.DB.prepare(`UPDATE pull_requests SET state='open',source_commit_id=?,target_commit_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND state='closed'`).bind(source.commitId, target.commitId, pull.id), event.statement]);
  return json({ ...pullPatch, update });
}

export async function reviewPull(request: Request, env: Env, principal: Principal, owner: string, name: string, number: number): Promise<Response> {
  const repository = await repo(env, owner, name);
  if (!repository || !(await membership(env, principal, repository))) return problem(404, 'repository_not_found', 'Repository not found.');
  const pull = await env.DB.prepare(`SELECT id, source_commit_id AS sourceCommitId, state FROM pull_requests WHERE repository_id = ? AND number = ?`).bind(repository.id, number).first<{ id: string; sourceCommitId: string; state: string }>();
  if (!pull || !['open', 'draft'].includes(pull.state)) return problem(409, 'pull_request_not_open', 'Pull request is not open.');
  const body = await readJson(request, reviewBody);
  if (!body || !['commented', 'approved', 'changes_requested'].includes(String(body.state))) return problem(422, 'invalid_review', 'Review state is invalid.');
  const id = identifier('review');
  const createdAt = new Date().toISOString();
  const review = { id, authorId: principal.id, author: principal.handle, authorDisplayName: principal.displayName, authorAvatarUrl: principal.avatarUrl, state: body.state, body: typeof body.body === 'string' ? body.body.slice(0, 20_000) : '', commitId: pull.sourceCommitId, createdAt };
  const update = await commitPullUpdate(env, pull.id, 'review.created', { timeline: [{ kind: 'review', value: review, createdAt }], refreshState: true }, [
    env.DB.prepare('INSERT INTO pull_request_reviews (id,pull_request_id,author_id,state,body,commit_id,created_at) VALUES (?,?,?,?,?,?,?)').bind(id, pull.id, principal.id, review.state, review.body, pull.sourceCommitId, createdAt)
  ]);
  return json({ review, update }, { status: 201 });
}

export async function mergePull(request: Request, env: Env, principal: Principal, owner: string, name: string, number: number): Promise<Response> {
  const repository = await repo(env, owner, name);
  if (!repository || !(await membership(env, principal, repository))) return problem(404, 'repository_not_found', 'Repository not found.');
  const pull = await env.DB.prepare(`${pullSelect} WHERE pull_requests.repository_id = ? AND pull_requests.number = ?`).bind(repository.id, number).first<PullRow>();
  if (!pull) return problem(404, 'pull_request_not_found', 'Pull request not found.');
  if (pull.state === 'merged' && pull.mergedCommitId) return json({ merged: true, commitId: pull.mergedCommitId });
  if (pull.state !== 'open') return problem(409, 'pull_request_not_open', 'Pull request is not open.');
  const body = await readJson(request, mergeBody);
  const method = body?.method ?? 'merge';
  if (!['merge', 'squash', 'rebase'].includes(String(method))) return problem(422, 'invalid_merge_method', 'Choose merge, squash, or rebase.');
  const [source, target, checks, reviews, unresolvedThreads] = await Promise.all([
    env.DB.prepare('SELECT commit_id AS commitId FROM branches WHERE repository_id = ? AND name = ?').bind(pull.sourceRepositoryId ?? repository.id, pull.sourceBranch).first<{ commitId: string }>(),
    env.DB.prepare('SELECT commit_id AS commitId FROM branches WHERE repository_id = ? AND name = ?').bind(repository.id, pull.targetBranch).first<{ commitId: string }>(),
    env.DB.prepare('SELECT name,state FROM checks WHERE repository_id = ? AND commit_id = ?').bind(pull.sourceRepositoryId ?? repository.id, pull.sourceCommitId).all<{ name: string; state: string }>(),
    env.DB.prepare(`SELECT author_id AS authorId,state,commit_id AS commitId,created_at AS createdAt FROM pull_request_reviews WHERE pull_request_id=? ORDER BY created_at`).bind(pull.id).all<{ authorId: string; state: string; commitId: string; createdAt: string }>(),
    env.DB.prepare('SELECT COUNT(*) AS count FROM review_threads WHERE pull_request_id = ? AND commit_id = ? AND resolved_at IS NULL').bind(pull.id, pull.sourceCommitId).first<{ count: number }>()
  ]);
  if (!source || !target) return problem(409, 'branch_missing', 'Source or target branch no longer exists.');
  const rule = await branchRuleFor(env, repository.id, pull.targetBranch);
  if (!rule.allowedMergeMethods.includes(method as MergeMethod)) return problem(409, 'merge_method_not_allowed', `${method} is not allowed for ${pull.targetBranch}.`);
  const checkSummary = { total: checks.results.length, passed: checks.results.filter((check) => check.state === 'success').length, failed: checks.results.filter((check) => ['failure', 'canceled'].includes(check.state)).length, running: checks.results.filter((check) => ['queued', 'running'].includes(check.state)).length, items: checks.results };
  const requirements = mergeRequirements(pull, rule, checkSummary, reviews.results, unresolvedThreads?.count ?? 0);
  if (!requirements.ready) return problem(409, 'merge_requirements_not_met', requirements.reasons[0] ?? 'Merge requirements are not met.', { reasons: requirements.reasons });
  const gateway = await requestGatewayWrite(env, '/_marl/merge', { operationId: pull.id, method, repositoryId: repository.id, owner, repository: name, sourceBranch: pull.sourceBranch, targetBranch: pull.targetBranch, sourceCommitId: pull.sourceCommitId, targetCommitId: pull.targetCommitId, title: `${method === 'squash' ? 'Squash' : method === 'rebase' ? 'Rebase' : 'Merge'} pull request #${number}: ${pull.title}`, author: principal.handle, actorId: principal.id });
  const result = await gateway.json().catch(() => null) as { commitId?: string; targetHeadId?: string; error?: string } | null;
  if (!gateway.ok || !result?.commitId) return problem(gateway.status === 409 ? 409 : 502, gateway.status === 409 ? 'merge_conflict' : 'merge_gateway_failed', result?.error ?? 'Git gateway could not merge this pull request.');
  const targetHeadId = result.targetHeadId ?? result.commitId;
  const event = createPullEvent(env, pull.id, principal, 'merged', { method: String(method), commit: result.commitId.slice(0, 7) });
  const pullPatch = { state: 'merged', mergedCommitId: result.commitId, mergeMethod: method };
  const update = await commitPullUpdate(env, pull.id, 'pull.merged', { pull: pullPatch, timeline: [{ kind: 'event', value: event.value, createdAt: event.value.createdAt }], refreshState: true }, [
    env.DB.prepare(`UPDATE pull_requests SET state='merged', target_commit_id=?, merged_commit_id=?,merge_method=?, merged_by=?, merged_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=? AND state='open'`).bind(pull.targetCommitId, result.commitId, method, principal.id, pull.id),
    env.DB.prepare('UPDATE branches SET commit_id=?, updated_at=CURRENT_TIMESTAMP WHERE repository_id=? AND name=? AND commit_id IN (?, ?)').bind(targetHeadId, repository.id, pull.targetBranch, pull.targetCommitId, result.commitId),
    event.statement,
    auditStatement(env, { organizationId: repository.organizationId, repositoryId: repository.id, actor: principal, action: 'pull.merged', subjectType: 'pull_request', subjectId: pull.id, details: { number, method, commitId: result.commitId, targetBranch: pull.targetBranch } })
  ]);
  return json({ merged: true, commitId: result.commitId, update });
}
