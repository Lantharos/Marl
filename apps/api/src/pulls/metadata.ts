import { labelColor } from '../core/labels';
import type { Principal } from '../auth/principal';
import { auditStatement } from '../core/audit';
import { identifier } from '../core/domain';
import { json, problem, readJson } from '../http/http';
import type { Env } from '../core/platform';
import { canManageRepository as membership, createPullEvent, pullRepository as repo } from './context';
import { commitPullUpdate } from './realtime/updates';
import { createPullLabelBody, pullMetadataBody } from '../http/request-schemas';

export async function updatePullMetadata(
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
    'SELECT id,locked_at AS lockedAt FROM pull_requests WHERE repository_id=? AND number=?'
  )
    .bind(repository.id, number)
    .first<{ id: string; lockedAt?: string }>();
  if (!pull) return problem(404, 'pull_request_not_found', 'Pull request not found.');
  const body = await readJson(request, pullMetadataBody);
  if (!body) return problem(400, 'invalid_json', 'Expected a JSON request body.');
  const [members, repositoryLabels, currentAssignees, currentLabels] = await Promise.all([
    env.DB.prepare(
      `SELECT users.id,users.handle FROM users JOIN organization_members ON organization_members.user_id=users.id WHERE organization_members.organization_id=?`
    )
      .bind(repository.organizationId)
      .all<{ id: string; handle: string }>(),
    env.DB.prepare('SELECT id,name FROM repository_labels WHERE repository_id=?')
      .bind(repository.id)
      .all<{ id: string; name: string }>(),
    env.DB.prepare('SELECT user_id AS id FROM pull_request_assignees WHERE pull_request_id=?')
      .bind(pull.id)
      .all<{ id: string }>(),
    env.DB.prepare('SELECT label_id AS id FROM pull_request_labels WHERE pull_request_id=?')
      .bind(pull.id)
      .all<{ id: string }>()
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
    if (
      !Array.isArray(body.assigneeIds) ||
      body.assigneeIds.length > 10 ||
      body.assigneeIds.some((id: unknown) => typeof id !== 'string')
    )
      return problem(422, 'invalid_assignees', 'Choose up to ten repository members.');
    const ids = [...new Set(body.assigneeIds as string[])];
    if (ids.some((id) => !memberNames.has(id)))
      return problem(422, 'invalid_assignees', 'Every assignee must belong to this repository organization.');
    const previous = new Set(currentAssignees.results.map((item) => item.id));
    const next = new Set(ids);
    if (ids.some((id) => !previous.has(id)) || [...previous].some((id) => !next.has(id))) {
      statements.push(env.DB.prepare('DELETE FROM pull_request_assignees WHERE pull_request_id=?').bind(pull.id));
      for (const id of ids)
        statements.push(
          env.DB.prepare('INSERT INTO pull_request_assignees (pull_request_id,user_id) VALUES (?,?)').bind(pull.id, id)
        );
      for (const id of ids.filter((id) => !previous.has(id)))
        addEvent('assigned', { handle: memberNames.get(id) ?? id });
      for (const id of [...previous].filter((id) => !next.has(id)))
        addEvent('unassigned', { handle: memberNames.get(id) ?? id });
    }
  }
  if (body.labelIds !== undefined) {
    if (
      !Array.isArray(body.labelIds) ||
      body.labelIds.length > 20 ||
      body.labelIds.some((id: unknown) => typeof id !== 'string')
    )
      return problem(422, 'invalid_labels', 'Choose up to twenty repository labels.');
    const ids = [...new Set(body.labelIds as string[])];
    if (ids.some((id) => !labelNames.has(id)))
      return problem(422, 'invalid_labels', 'Every label must belong to this repository.');
    const previous = new Set(currentLabels.results.map((item) => item.id));
    const next = new Set(ids);
    if (ids.some((id) => !previous.has(id)) || [...previous].some((id) => !next.has(id))) {
      statements.push(env.DB.prepare('DELETE FROM pull_request_labels WHERE pull_request_id=?').bind(pull.id));
      for (const id of ids)
        statements.push(
          env.DB.prepare('INSERT INTO pull_request_labels (pull_request_id,label_id) VALUES (?,?)').bind(pull.id, id)
        );
      for (const id of ids.filter((id) => !previous.has(id)))
        addEvent('label_added', { label: labelNames.get(id) ?? id });
      for (const id of [...previous].filter((id) => !next.has(id)))
        addEvent('label_removed', { label: labelNames.get(id) ?? id });
    }
  }
  if (body.locked !== undefined) {
    if (typeof body.locked !== 'boolean')
      return problem(422, 'invalid_lock_state', 'Conversation lock state must be a boolean.');
    if (body.locked !== Boolean(pull.lockedAt)) {
      statements.push(
        env.DB.prepare('UPDATE pull_requests SET locked_at=?,locked_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(
          body.locked ? new Date().toISOString() : null,
          body.locked ? principal.id : null,
          pull.id
        )
      );
      addEvent(body.locked ? 'locked' : 'unlocked');
    }
  }
  if (!statements.length) return json({ updated: false });
  const assigneeIds =
    body.assigneeIds === undefined
      ? currentAssignees.results.map((item) => item.id)
      : [...new Set(body.assigneeIds as string[])];
  const labelIds =
    body.labelIds === undefined
      ? currentLabels.results.map((item) => item.id)
      : [...new Set(body.labelIds as string[])];
  const locked = body.locked === undefined ? Boolean(pull.lockedAt) : body.locked;
  const update = await commitPullUpdate(
    env,
    pull.id,
    'metadata.updated',
    {
      metadata: { assigneeIds, labelIds, locked },
      timeline: events.map((event) => ({ kind: 'event', value: event.value, createdAt: event.value.createdAt }))
    },
    statements
  );
  return json({ updated: true, metadata: { assigneeIds, labelIds, locked }, update });
}

export async function createPullLabel(
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
  const pull = await env.DB.prepare('SELECT id FROM pull_requests WHERE repository_id=? AND number=?')
    .bind(repository.id, number)
    .first<{ id: string }>();
  if (!pull) return problem(404, 'pull_request_not_found', 'Pull request not found.');
  const body = await readJson(request, createPullLabelBody);
  const labelName = body?.name.trim().replace(/\s+/g, ' ') ?? '';
  if (!labelName || /[\u0000-\u001f\u007f]/.test(labelName))
    return problem(422, 'invalid_label', 'Enter a valid label name.');

  const existing = await env.DB.prepare(
    'SELECT id,name,color,description FROM repository_labels WHERE repository_id=? AND name=? COLLATE NOCASE'
  )
    .bind(repository.id, labelName)
    .first<{ id: string; name: string; color: string; description: string }>();
  const label = existing ?? {
    id: identifier('label'),
    name: labelName,
    color: labelColor(labelName),
    description: ''
  };
  const current = await env.DB.prepare('SELECT label_id AS id FROM pull_request_labels WHERE pull_request_id=?')
    .bind(pull.id)
    .all<{ id: string }>();
  if (current.results.some((item) => item.id === label.id)) return json({ label, applied: false });
  if (current.results.length >= 20)
    return problem(422, 'too_many_labels', 'A pull request can have up to twenty labels.');

  const labelIds = [...current.results.map((item) => item.id), label.id];
  const event = createPullEvent(env, pull.id, principal, 'label_added', { label: label.name });
  const statements = [
    ...(!existing
      ? [
          env.DB.prepare(
            'INSERT INTO repository_labels (id,repository_id,name,color,description) VALUES (?,?,?,?,?)'
          ).bind(label.id, repository.id, label.name, label.color, label.description),
          auditStatement(env, {
            organizationId: repository.organizationId,
            repositoryId: repository.id,
            actor: principal,
            action: 'repository.label_created',
            subjectType: 'repository_label',
            subjectId: label.id,
            details: { name: label.name }
          })
        ]
      : []),
    env.DB.prepare('INSERT INTO pull_request_labels (pull_request_id,label_id) VALUES (?,?)').bind(pull.id, label.id),
    event.statement
  ];
  const update = await commitPullUpdate(
    env,
    pull.id,
    'label.created',
    {
      label,
      metadata: { labelIds },
      timeline: [{ kind: 'event', value: event.value, createdAt: event.value.createdAt }]
    },
    statements
  );
  return json({ label, applied: true, update }, { status: existing ? 200 : 201 });
}
