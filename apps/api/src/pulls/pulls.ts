import { bodyExcerpt, renderBody } from '../core/markdown';
import type { Principal } from '../auth/principal';
import { auditStatement } from '../core/audit';
import { identifier, validBranchName } from '../core/domain';
import { pinPullRefs } from '../git/writes';
import { json, problem, readJson } from '../http/http';
import type { Env } from '../core/platform';
import {
  canManageRepository as membership,
  createPullEvent,
  preservePullRefs,
  pullCommits,
  pullRepository as repo,
  pullSelect,
  pullSummary as summary,
  type PullRow
} from './context';
import { commitPullUpdate } from './realtime/updates';
import { queuePullWorkflows } from './merge/checks';
import { revisionUpdateStatements } from './review/revision-updates';
import { createPullBody, updatePullBody } from '../http/request-schemas';
import { authorizeRepository } from '../repositories/access/access';
import { referenceStatements } from '../issues/references/work-items';
import { mentionStatements } from '../issues/references/mentions';

export async function createPull(
  request: Request,
  env: Env,
  principal: Principal,
  owner: string,
  name: string
): Promise<Response> {
  const repository = await repo(env, owner, name);
  if (!repository || !(await authorizeRepository(env, principal, owner, name, 'repository.read')))
    return problem(404, 'repository_not_found', 'Repository not found.');
  const body = await readJson(request, createPullBody);
  if (
    !body ||
    typeof body.title !== 'string' ||
    body.title.trim().length < 3 ||
    body.title.length > 240 ||
    !validBranchName(body.sourceBranch) ||
    !validBranchName(body.targetBranch)
  )
    return problem(422, 'invalid_pull_request', 'Title and valid source and target branches are required.');
  const sourceParts = body.sourceRepository?.split('/') ?? [owner, name];
  if (sourceParts.length !== 2) return problem(422, 'invalid_source_repository', 'Choose a valid source repository.');
  const [sourceOwner, sourceName] = sourceParts;
  const sourceRepository = await repo(env, sourceOwner, sourceName);
  if (!sourceRepository || !(await authorizeRepository(env, principal, sourceOwner, sourceName, 'repository.push')))
    return problem(404, 'source_repository_not_found', 'Source repository not found.');
  const sameRepository = sourceRepository.id === repository.id;
  if (sameRepository && !(await membership(env, principal, repository)))
    return problem(404, 'repository_not_found', 'Repository not found.');
  if ((await forkRoot(env, sourceRepository.id)) !== (await forkRoot(env, repository.id)))
    return problem(
      422,
      'unrelated_repositories',
      'Pull requests can only cross repositories in the same fork network.'
    );
  if (sameRepository && body.sourceBranch === body.targetBranch)
    return problem(422, 'invalid_pull_request', 'Choose two different branches.');
  const [source, target] = await Promise.all([
    env.DB.prepare('SELECT name,commit_id AS commitId FROM branches WHERE repository_id=? AND name=?')
      .bind(sourceRepository.id, body.sourceBranch)
      .first<{ name: string; commitId: string }>(),
    env.DB.prepare('SELECT name,commit_id AS commitId FROM branches WHERE repository_id=? AND name=?')
      .bind(repository.id, body.targetBranch)
      .first<{ name: string; commitId: string }>()
  ]);
  if (!source || !target) return problem(422, 'branch_not_found', 'Source or target branch does not exist.');
  const duplicate = await env.DB.prepare(
    `SELECT number FROM pull_requests WHERE repository_id=? AND COALESCE(source_repository_id,repository_id)=? AND source_branch=? AND target_branch=? AND state IN ('draft','open')`
  )
    .bind(repository.id, sourceRepository.id, body.sourceBranch, body.targetBranch)
    .first<{ number: number }>();
  if (duplicate) {
    const existing = await env.DB.prepare(
      `${pullSelect} WHERE pull_requests.repository_id = ? AND pull_requests.number = ?`
    )
      .bind(repository.id, duplicate.number)
      .first<PullRow>();
    if (!existing)
      return problem(409, 'pull_request_exists', `Pull request !${duplicate.number} already proposes this branch.`);
    const pinned = await preservePullRefs(env, repository, existing);
    if (pinned) return pinned;
    return json({ pullRequest: summary(existing) });
  }
  const id = identifier('pr');
  const state = body.draft === true ? 'draft' : 'open';
  const description = typeof body.body === 'string' ? body.body.slice(0, 100_000) : '';
  const mentions = await mentionStatements(
    env,
    principal,
    { kind: 'pull', id },
    'pull_body',
    id,
    description,
    new Date().toISOString()
  );
  const commits = await pullCommits(env, repository.id, sourceRepository.id, source.commitId, target.commitId);
  const commitEvent = commits.results.length
    ? createPullEvent(env, id, principal, 'commits_added', {
        commits: JSON.stringify(commits.results.map((commit) => ({ id: commit.id, title: commit.title }))),
        owner: sourceOwner,
        repository: sourceName,
        head: source.commitId,
        base: target.commitId,
        forcePushed: 'false'
      })
    : null;
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO pull_requests (id,repository_id,source_repository_id,number,title,body,author_id,source_branch,target_branch,source_commit_id,target_commit_id,state) SELECT ?,?,?,COALESCE(MAX(number),0)+1,?,?,?,?,?,?,?,? FROM pull_requests WHERE repository_id=?`
    ).bind(
      id,
      repository.id,
      sameRepository ? null : sourceRepository.id,
      body.title.trim(),
      description,
      principal.id,
      body.sourceBranch,
      body.targetBranch,
      source.commitId,
      target.commitId,
      state,
      repository.id
    ),
    ...mentions,
    ...(commitEvent ? [commitEvent.statement] : []),
    auditStatement(env, {
      organizationId: repository.organizationId,
      repositoryId: repository.id,
      actor: principal,
      action: 'pull.created',
      subjectType: 'pull_request',
      subjectId: id,
      details: {
        sourceRepository: `${sourceOwner}/${sourceName}`,
        sourceBranch: body.sourceBranch,
        targetBranch: body.targetBranch,
        state
      }
    })
  ]);
  const created = await env.DB.prepare(`${pullSelect} WHERE pull_requests.id = ?`).bind(id).first<PullRow>();
  if (!created) return problem(500, 'pull_request_create_failed', 'Pull request creation did not persist.');
  const pinned = await preservePullRefs(env, repository, created);
  if (pinned) return pinned;
  const references = await referenceStatements(
    env,
    principal,
    { kind: 'pull', id, owner, repository: name },
    'body',
    id,
    created.body
  );
  if (references.length) await env.DB.batch(references);
  await queuePullWorkflows(env, id);
  return json({ pullRequest: created && summary(created) }, { status: 201 });
}

async function forkRoot(env: Env, repositoryId: string) {
  const row = await env.DB.prepare('SELECT COALESCE(fork_root_repository_id,id) AS rootId FROM repositories WHERE id=?')
    .bind(repositoryId)
    .first<{ rootId: string }>();
  return row?.rootId ?? '';
}

export async function updatePullDetails(
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
  const pull = await env.DB.prepare('SELECT id,title,body FROM pull_requests WHERE repository_id=? AND number=?')
    .bind(repository.id, number)
    .first<{ id: string; title: string; body: string }>();
  if (!pull) return problem(404, 'pull_request_not_found', 'Pull request not found.');
  const body = await readJson(request, updatePullBody);
  if (!body) return problem(400, 'invalid_json', 'Expected a JSON request body.');
  const title = body.title === undefined ? pull.title : typeof body.title === 'string' ? body.title.trim() : '';
  const description = body.body === undefined ? pull.body : typeof body.body === 'string' ? body.body.trim() : '';
  if (title.length < 3 || title.length > 240 || description.length > 100_000)
    return problem(422, 'invalid_pull_request', 'Title and description are invalid.');
  const bodyHtml = renderBody(description, { owner, repository: name }, pull.id);
  const events: ReturnType<typeof createPullEvent>[] = [];
  if (title !== pull.title)
    events.push(createPullEvent(env, pull.id, principal, 'title_changed', { from: pull.title, to: title }));
  if (description !== pull.body) events.push(createPullEvent(env, pull.id, principal, 'description_changed'));
  const statements = events.map((event) => event.statement);
  if (!statements.length) return problem(422, 'unchanged_pull_request', 'No pull request details changed.');
  if (description !== pull.body)
    statements.push(
      ...(await referenceStatements(
        env,
        principal,
        { kind: 'pull', id: pull.id, owner, repository: name },
        'body',
        pull.id,
        description
      ))
    );
  if (description !== pull.body)
    statements.push(
      ...(await mentionStatements(
        env,
        principal,
        { kind: 'pull', id: pull.id },
        'pull_body',
        pull.id,
        description,
        new Date().toISOString()
      ))
    );
  statements.unshift(
    env.DB.prepare('UPDATE pull_requests SET title=?,body=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(
      title,
      description,
      pull.id
    )
  );
  const update = await commitPullUpdate(
    env,
    pull.id,
    'details.updated',
    {
      details: { title, body: description, bodyHtml, bodyText: bodyExcerpt(bodyHtml) },
      timeline: events.map((event) => ({ kind: 'event', value: event.value, createdAt: event.value.createdAt })),
      refreshState: true
    },
    statements
  );
  return json({ updated: true, pull: { title, body: description, bodyHtml, bodyText: bodyExcerpt(bodyHtml) }, update });
}

export async function transitionPull(
  env: Env,
  principal: Principal,
  owner: string,
  name: string,
  number: number,
  action: 'ready' | 'close' | 'reopen'
): Promise<Response> {
  const repository = await repo(env, owner, name);
  if (!repository || !(await membership(env, principal, repository)))
    return problem(404, 'repository_not_found', 'Repository not found.');
  const pull = await env.DB.prepare(`${pullSelect} WHERE pull_requests.repository_id=? AND pull_requests.number=?`)
    .bind(repository.id, number)
    .first<PullRow>();
  if (!pull) return problem(404, 'pull_request_not_found', 'Pull request not found.');
  if (action === 'ready') {
    if (pull.state !== 'draft')
      return problem(409, 'pull_request_not_draft', 'Only a draft pull request can be marked ready.');
    const event = createPullEvent(env, pull.id, principal, 'ready');
    const update = await commitPullUpdate(
      env,
      pull.id,
      'pull.ready',
      {
        pull: { state: 'open' },
        timeline: [{ kind: 'event', value: event.value, createdAt: event.value.createdAt }],
        refreshState: true
      },
      [
        env.DB.prepare(
          `UPDATE pull_requests SET state='open',updated_at=CURRENT_TIMESTAMP WHERE id=? AND state='draft'`
        ).bind(pull.id),
        event.statement
      ]
    );
    await queuePullWorkflows(env, pull.id);
    return json({ state: 'open', update });
  }
  if (action === 'close') {
    if (!['draft', 'open'].includes(pull.state))
      return problem(409, 'pull_request_not_open', 'Only an open pull request can be closed.');
    const event = createPullEvent(env, pull.id, principal, 'closed');
    const update = await commitPullUpdate(
      env,
      pull.id,
      'pull.closed',
      {
        pull: { state: 'closed' },
        timeline: [{ kind: 'event', value: event.value, createdAt: event.value.createdAt }],
        refreshState: true
      },
      [
        env.DB.prepare(
          `UPDATE pull_requests SET state='closed',updated_at=CURRENT_TIMESTAMP WHERE id=? AND state IN ('draft','open')`
        ).bind(pull.id),
        event.statement
      ]
    );
    return json({ state: 'closed', update });
  }
  if (pull.state !== 'closed')
    return problem(409, 'pull_request_not_closed', 'Only a closed pull request can be reopened.');
  const [source, target] = await Promise.all([
    env.DB.prepare('SELECT name,commit_id AS commitId FROM branches WHERE repository_id=? AND name=?')
      .bind(pull.sourceRepositoryId ?? repository.id, pull.sourceBranch)
      .first<{ name: string; commitId: string }>(),
    env.DB.prepare('SELECT name,commit_id AS commitId FROM branches WHERE repository_id=? AND name=?')
      .bind(repository.id, pull.targetBranch)
      .first<{ name: string; commitId: string }>()
  ]);
  if (!source || !target)
    return problem(409, 'branch_missing', 'Both pull request branches must exist before reopening.');
  const duplicate = await env.DB.prepare(
    `SELECT number FROM pull_requests WHERE repository_id=? AND COALESCE(source_repository_id,repository_id)=? AND source_branch=? AND target_branch=? AND state IN ('draft','open') AND id!=?`
  )
    .bind(repository.id, pull.sourceRepositoryId ?? repository.id, pull.sourceBranch, pull.targetBranch, pull.id)
    .first<{ number: number }>();
  if (duplicate)
    return problem(409, 'pull_request_exists', `Pull request !${duplicate.number} already proposes this branch.`);
  const pinned = await pinPullRefs(env, {
    owner,
    repository: name,
    number,
    sourceCommitId: source.commitId,
    targetCommitId: target.commitId,
    expectedSourceCommitId: pull.sourceCommitId,
    expectedTargetCommitId: pull.targetCommitId,
    ...(pull.sourceRepositoryId
      ? {
          sourceOwner: pull.sourceOwner,
          sourceRepository: pull.sourceRepository,
          sourceRepositoryId: pull.sourceRepositoryId
        }
      : {})
  });
  if (!pinned.ok)
    return problem(502, 'pull_ref_sync_failed', 'Pull request commits could not be preserved while reopening.');
  const event = createPullEvent(env, pull.id, principal, 'reopened');
  const revisionStatements =
    source.commitId !== pull.sourceCommitId
      ? revisionUpdateStatements(env, pull.id, pull.sourceCommitId, source.commitId, principal, {
          head: source.commitId,
          base: target.commitId,
          previousHead: pull.sourceCommitId,
          commits: JSON.stringify(
            (
              await pullCommits(
                env,
                repository.id,
                pull.sourceRepositoryId ?? repository.id,
                source.commitId,
                target.commitId
              )
            ).results.map(({ id, title }) => ({ id, title }))
          ),
          forcePushed: 'true',
          owner: pull.sourceOwner,
          repository: pull.sourceRepository
        })
      : [];
  const pullPatch = { state: 'open', sourceCommitId: source.commitId, targetCommitId: target.commitId };
  const update = await commitPullUpdate(
    env,
    pull.id,
    'pull.reopened',
    {
      pull: pullPatch,
      timeline: [{ kind: 'event', value: event.value, createdAt: event.value.createdAt }],
      refreshState: true
    },
    [
      env.DB.prepare(
        `UPDATE pull_requests SET state='open',source_commit_id=?,target_commit_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND state='closed'`
      ).bind(source.commitId, target.commitId, pull.id),
      ...revisionStatements,
      event.statement
    ]
  );
  await queuePullWorkflows(env, pull.id);
  return json({ ...pullPatch, update });
}
