import type { Principal } from './auth';
import { auditStatement } from './audit';
import { identifier } from './domain';
import { json, problem, readJson } from './http';
import { createIssueEvent, issueSelect, summarizeIssueRows, type IssueRow } from './issue-context';
import type { Env } from './platform';
import { commentBody, createIssueBody, createPullLabelBody, issueMetadataBody, issueStateBody, updateIssueBody } from './request-schemas';
import { authorizeRepository } from './repository-access';
import type { RepositoryAccess } from './repository-access';
import { deleteReferenceStatements, linkedWorkItems, referenceStatements } from './work-item-references';
import { deleteMentionStatements, mentionStatements } from './mentions';

type EditableIssue = { id: string; title: string; body: string; state: 'open' | 'closed'; authorId: string };

export async function createIssue(request: Request, env: Env, principal: Principal, owner: string, name: string): Promise<Response> {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.read');
  if (!repository) return problem(404, 'repository_not_found', 'Repository not found.');
  if (repository.archivedAt) return problem(409, 'repository_archived', 'Archived repositories cannot accept new issues.');
  const body = await readJson(request, createIssueBody);
  const title = body?.title.trim() ?? '';
  if (title.length < 3) return problem(422, 'invalid_issue', 'Issue titles must contain at least three characters.');
  const id = identifier('issue');
  const description = body?.body?.trim() ?? '';
  const createdAt = new Date().toISOString();
  const mentions = await mentionStatements(env, principal, { kind: 'issue', id }, 'issue_body', id, description, createdAt);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO issues (id,repository_id,number,title,body,author_id,created_at,updated_at) SELECT ?,?,COALESCE(MAX(number),0)+1,?,?,?,?,? FROM issues WHERE repository_id=?').bind(id, repository.id, title, description, principal.id, createdAt, createdAt, repository.id),
    ...mentions,
    auditStatement(env, { organizationId: repository.organizationId, repositoryId: repository.id, actor: principal, action: 'issue.created', subjectType: 'issue', subjectId: id })
  ]);
  const row = await env.DB.prepare(`${issueSelect} WHERE issues.id=?`).bind(id).first<IssueRow>();
  if (!row) return problem(500, 'issue_create_failed', 'Issue creation did not persist.');
  const references = await referenceStatements(env, principal, { kind: 'issue', id, owner, repository: name }, 'body', id, description);
  if (references.length) await env.DB.batch(references);
  return json({ issue: (await summarizeIssueRows(env, [row]))[0] }, { status: 201 });
}

export async function updateIssue(request: Request, env: Env, principal: Principal, owner: string, name: string, number: number): Promise<Response> {
  const context = await editableIssue(env, principal, owner, name, number);
  if ('response' in context) return context.response;
  const body = await readJson(request, updateIssueBody);
  if (!body) return problem(400, 'invalid_json', 'Expected a JSON request body.');
  const title = body.title === undefined ? context.issue.title : body.title.trim();
  const description = body.body === undefined ? context.issue.body : body.body.trim();
  if (title.length < 3) return problem(422, 'invalid_issue', 'Issue titles must contain at least three characters.');
  const events: ReturnType<typeof createIssueEvent>[] = [];
  if (title !== context.issue.title) events.push(createIssueEvent(env, context.issue.id, principal, 'title_changed', { from: context.issue.title, to: title }));
  if (description !== context.issue.body) events.push(createIssueEvent(env, context.issue.id, principal, 'description_changed'));
  if (!events.length) return problem(422, 'unchanged_issue', 'No issue details changed.');
  const references = description === context.issue.body ? [] : await referenceStatements(env, principal, { kind: 'issue', id: context.issue.id, owner, repository: name }, 'body', context.issue.id, description);
  const mentions = description === context.issue.body ? [] : await mentionStatements(env, principal, { kind: 'issue', id: context.issue.id }, 'issue_body', context.issue.id, description, new Date().toISOString());
  await env.DB.batch([
    env.DB.prepare('UPDATE issues SET title=?,body=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(title, description, context.issue.id),
    ...references,
    ...mentions,
    ...events.map((event) => event.statement),
    auditStatement(env, { organizationId: context.repository.organizationId, repositoryId: context.repository.id, actor: principal, action: 'issue.updated', subjectType: 'issue', subjectId: context.issue.id })
  ]);
  return json({ issue: { title, body: description }, linkedItems: await linkedWorkItems(env, principal, 'issue', context.issue.id), timeline: events.map((event) => ({ kind: 'event', value: event.value, createdAt: event.value.createdAt })) });
}

export async function setIssueState(request: Request, env: Env, principal: Principal, owner: string, name: string, number: number): Promise<Response> {
  const context = await editableIssue(env, principal, owner, name, number);
  if ('response' in context) return context.response;
  const body = await readJson(request, issueStateBody);
  if (!body) return problem(400, 'invalid_json', 'Expected a JSON request body.');
  if (body.state === context.issue.state) return problem(422, 'unchanged_issue', `Issue is already ${body.state}.`);
  const event = createIssueEvent(env, context.issue.id, principal, body.state === 'closed' ? 'closed' : 'reopened');
  await env.DB.batch([
    env.DB.prepare(`UPDATE issues SET state=?,closed_by=?,closed_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(body.state, body.state === 'closed' ? principal.id : null, body.state === 'closed' ? new Date().toISOString() : null, context.issue.id),
    event.statement,
    auditStatement(env, { organizationId: context.repository.organizationId, repositoryId: context.repository.id, actor: principal, action: `issue.${body.state}`, subjectType: 'issue', subjectId: context.issue.id })
  ]);
  return json({ state: body.state, timeline: { kind: 'event', value: event.value, createdAt: event.value.createdAt } });
}

export async function addIssueComment(request: Request, env: Env, principal: Principal, owner: string, name: string, number: number): Promise<Response> {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.read');
  if (!repository) return problem(404, 'repository_not_found', 'Repository not found.');
  const issue = await env.DB.prepare('SELECT id,locked_at AS lockedAt FROM issues WHERE repository_id=? AND number=?').bind(repository.id, number).first<{ id: string; lockedAt: string | null }>();
  if (!issue) return problem(404, 'issue_not_found', 'Issue not found.');
  if (issue.lockedAt && !(await authorizeRepository(env, principal, owner, name, 'repository.triage'))) return problem(423, 'issue_locked', 'This issue is locked.');
  const body = await readJson(request, commentBody);
  if (!body?.body.trim()) return problem(422, 'invalid_comment', 'Comment body is required.');
  const id = identifier('comment');
  const createdAt = new Date().toISOString();
  const comment = body.body.trim();
  const references = await referenceStatements(env, principal, { kind: 'issue', id: issue.id, owner, repository: name }, 'comment', id, comment);
  const mentions = await mentionStatements(env, principal, { kind: 'issue', id: issue.id }, 'issue_comment', id, comment, createdAt);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO issue_comments (id,issue_id,author_id,body,created_at,updated_at) VALUES (?,?,?,?,?,?)').bind(id, issue.id, principal.id, comment, createdAt, createdAt),
    ...references,
    ...mentions,
    env.DB.prepare('UPDATE issues SET updated_at=? WHERE id=?').bind(createdAt, issue.id)
  ]);
  return json({ comment: { id, authorId: principal.id, author: principal.handle, authorDisplayName: principal.displayName, authorAvatarUrl: principal.avatarUrl, body: comment, createdAt, updatedAt: createdAt, deleted: false, canEdit: true }, linkedItems: await linkedWorkItems(env, principal, 'issue', issue.id) }, { status: 201 });
}

export async function updateIssueComment(request: Request, env: Env, principal: Principal, commentId: string): Promise<Response> {
  const comment = await commentContext(env, principal, commentId);
  if (!comment || (!comment.canManage && comment.authorId !== principal.id)) return problem(404, 'comment_not_found', 'Comment not found.');
  if (comment.deletedAt) return problem(409, 'comment_deleted', 'Deleted comments cannot be edited.');
  const body = await readJson(request, commentBody);
  if (!body?.body.trim()) return problem(422, 'invalid_comment', 'Comment body is required.');
  const updatedAt = new Date().toISOString();
  const value = body.body.trim();
  const references = await referenceStatements(env, principal, { kind: 'issue', id: comment.issueId, owner: comment.owner, repository: comment.repository }, 'comment', commentId, value);
  const mentions = await mentionStatements(env, principal, { kind: 'issue', id: comment.issueId }, 'issue_comment', commentId, value, updatedAt);
  await env.DB.batch([env.DB.prepare('UPDATE issue_comments SET body=?,updated_at=? WHERE id=?').bind(value, updatedAt, commentId), ...references, ...mentions]);
  return json({ comment: { id: commentId, body: value, updatedAt }, linkedItems: await linkedWorkItems(env, principal, 'issue', comment.issueId) });
}

export async function deleteIssueComment(env: Env, principal: Principal, commentId: string): Promise<Response> {
  const comment = await commentContext(env, principal, commentId);
  if (!comment || (!comment.canManage && comment.authorId !== principal.id)) return problem(404, 'comment_not_found', 'Comment not found.');
  if (comment.deletedAt) return problem(409, 'comment_deleted', 'Comment is already deleted.');
  const deletedAt = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('UPDATE issue_comments SET body=?,deleted_at=?,updated_at=? WHERE id=?').bind('', deletedAt, deletedAt, commentId),
    ...deleteReferenceStatements(env, 'comment', commentId),
    ...deleteMentionStatements(env, 'issue_comment', commentId)
  ]);
  return json({ deleted: true, id: commentId, updatedAt: deletedAt, linkedItems: await linkedWorkItems(env, principal, 'issue', comment.issueId) });
}

export async function updateIssueMetadata(request: Request, env: Env, principal: Principal, owner: string, name: string, number: number): Promise<Response> {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.triage');
  if (!repository) return problem(404, 'repository_not_found', 'Repository not found.');
  const issue = await env.DB.prepare('SELECT id,locked_at AS lockedAt FROM issues WHERE repository_id=? AND number=?').bind(repository.id, number).first<{ id: string; lockedAt: string | null }>();
  if (!issue) return problem(404, 'issue_not_found', 'Issue not found.');
  const body = await readJson(request, issueMetadataBody);
  if (!body) return problem(400, 'invalid_json', 'Expected a JSON request body.');
  const [members, labels, currentAssignees, currentLabels] = await Promise.all([
    body.assigneeIds === undefined ? Promise.resolve({ results: [] }) : env.DB.prepare('SELECT users.id,users.handle FROM users JOIN organization_members ON organization_members.user_id=users.id WHERE organization_members.organization_id=?').bind(repository.organizationId).all<{ id: string; handle: string }>(),
    body.labelIds === undefined ? Promise.resolve({ results: [] }) : env.DB.prepare('SELECT id,name FROM repository_labels WHERE repository_id=?').bind(repository.id).all<{ id: string; name: string }>(),
    body.assigneeIds === undefined ? Promise.resolve({ results: [] }) : env.DB.prepare('SELECT user_id AS id FROM issue_assignees WHERE issue_id=?').bind(issue.id).all<{ id: string }>(),
    body.labelIds === undefined ? Promise.resolve({ results: [] }) : env.DB.prepare('SELECT label_id AS id FROM issue_labels WHERE issue_id=?').bind(issue.id).all<{ id: string }>()
  ]);
  const memberNames = new Map(members.results.map((item) => [item.id, item.handle]));
  const labelNames = new Map(labels.results.map((item) => [item.id, item.name]));
  const statements = [];
  const events: ReturnType<typeof createIssueEvent>[] = [];
  const addEvent = (kind: string, details: Record<string, string> = {}) => { const event = createIssueEvent(env, issue.id, principal, kind, details); events.push(event); statements.push(event.statement); };
  if (body.assigneeIds !== undefined) {
    const ids = [...new Set(body.assigneeIds)];
    if (ids.some((id) => !memberNames.has(id))) return problem(422, 'invalid_assignees', 'Every assignee must belong to this repository organization.');
    const previous = new Set(currentAssignees.results.map((item) => item.id));
    if (ids.length !== previous.size || ids.some((id) => !previous.has(id))) {
      statements.push(env.DB.prepare('DELETE FROM issue_assignees WHERE issue_id=?').bind(issue.id));
      for (const id of ids) statements.push(env.DB.prepare('INSERT INTO issue_assignees (issue_id,user_id) VALUES (?,?)').bind(issue.id, id));
      for (const id of ids.filter((id) => !previous.has(id))) addEvent('assigned', { handle: memberNames.get(id) ?? id });
      for (const id of [...previous].filter((id) => !ids.includes(id))) addEvent('unassigned', { handle: memberNames.get(id) ?? id });
    }
  }
  if (body.labelIds !== undefined) {
    const ids = [...new Set(body.labelIds)];
    if (ids.some((id) => !labelNames.has(id))) return problem(422, 'invalid_labels', 'Every label must belong to this repository.');
    const previous = new Set(currentLabels.results.map((item) => item.id));
    if (ids.length !== previous.size || ids.some((id) => !previous.has(id))) {
      statements.push(env.DB.prepare('DELETE FROM issue_labels WHERE issue_id=?').bind(issue.id));
      for (const id of ids) statements.push(env.DB.prepare('INSERT INTO issue_labels (issue_id,label_id) VALUES (?,?)').bind(issue.id, id));
      for (const id of ids.filter((id) => !previous.has(id))) addEvent('label_added', { label: labelNames.get(id) ?? id });
      for (const id of [...previous].filter((id) => !ids.includes(id))) addEvent('label_removed', { label: labelNames.get(id) ?? id });
    }
  }
  if (body.locked !== undefined && body.locked !== Boolean(issue.lockedAt)) {
    statements.push(env.DB.prepare('UPDATE issues SET locked_at=?,locked_by=? WHERE id=?').bind(body.locked ? new Date().toISOString() : null, body.locked ? principal.id : null, issue.id));
    addEvent(body.locked ? 'locked' : 'unlocked');
  }
  if (!statements.length) return problem(422, 'unchanged_issue', 'No issue metadata changed.');
  statements.push(env.DB.prepare('UPDATE issues SET updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(issue.id));
  statements.push(auditStatement(env, { organizationId: repository.organizationId, repositoryId: repository.id, actor: principal, action: 'issue.metadata_updated', subjectType: 'issue', subjectId: issue.id }));
  await env.DB.batch(statements);
  return json({ updated: true, timeline: events.map((event) => ({ kind: 'event', value: event.value, createdAt: event.value.createdAt })) });
}

export async function createIssueLabel(request: Request, env: Env, principal: Principal, owner: string, name: string, number: number): Promise<Response> {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.triage');
  if (!repository) return problem(404, 'repository_not_found', 'Repository not found.');
  const issue = await env.DB.prepare('SELECT id FROM issues WHERE repository_id=? AND number=?').bind(repository.id, number).first<{ id: string }>();
  if (!issue) return problem(404, 'issue_not_found', 'Issue not found.');
  const body = await readJson(request, createPullLabelBody);
  const labelName = body?.name.trim().replace(/\s+/g, ' ') ?? '';
  if (!labelName) return problem(422, 'invalid_label', 'Label name is required.');
  const existing = await env.DB.prepare('SELECT id,name,color,description FROM repository_labels WHERE repository_id=? AND name=? COLLATE NOCASE').bind(repository.id, labelName).first<{ id: string; name: string; color: string; description: string }>();
  const label = existing ?? { id: identifier('label'), name: labelName, color: labelColor(labelName), description: '' };
  if (!existing) await env.DB.batch([
    env.DB.prepare('INSERT INTO repository_labels (id,repository_id,name,color,description) VALUES (?,?,?,?,?)').bind(label.id, repository.id, label.name, label.color, label.description),
    auditStatement(env, { organizationId: repository.organizationId, repositoryId: repository.id, actor: principal, action: 'repository.label_created', subjectType: 'repository_label', subjectId: label.id })
  ]);
  return json({ label }, { status: existing ? 200 : 201 });
}

async function editableIssue(env: Env, principal: Principal, owner: string, name: string, number: number): Promise<{ response: Response } | { repository: RepositoryAccess; issue: EditableIssue }> {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.read');
  if (!repository) return { response: problem(404, 'repository_not_found', 'Repository not found.') };
  const issue = await env.DB.prepare('SELECT id,title,body,state,author_id AS authorId FROM issues WHERE repository_id=? AND number=?').bind(repository.id, number).first<EditableIssue>();
  if (!issue) return { response: problem(404, 'issue_not_found', 'Issue not found.') };
  if (issue.authorId !== principal.id && !(await authorizeRepository(env, principal, owner, name, 'repository.triage'))) return { response: problem(403, 'issue_permission_denied', 'You cannot change this issue.') };
  return { repository, issue };
}

async function commentContext(env: Env, principal: Principal, commentId: string) {
  const row = await env.DB.prepare('SELECT issue_comments.author_id AS authorId,issue_comments.deleted_at AS deletedAt,issues.id AS issueId,organizations.slug AS owner,repositories.name AS repository FROM issue_comments JOIN issues ON issues.id=issue_comments.issue_id JOIN repositories ON repositories.id=issues.repository_id JOIN organizations ON organizations.id=repositories.organization_id WHERE issue_comments.id=?').bind(commentId).first<{ authorId: string; deletedAt: string | null; issueId: string; owner: string; repository: string }>();
  if (!row || !(await authorizeRepository(env, principal, row.owner, row.repository, 'repository.read'))) return null;
  return { ...row, canManage: row.authorId === principal.id ? false : Boolean(await authorizeRepository(env, principal, row.owner, row.repository, 'repository.triage')) };
}

function labelColor(name: string) {
  let hash = 0;
  for (const character of name) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 58% 58%)`;
}
