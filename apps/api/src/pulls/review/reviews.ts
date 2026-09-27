import { renderBody } from '../../core/markdown';
import type { Principal } from '../../auth/principal';
import { identifier } from '../../core/domain';
import { json, problem, readJson } from '../../http/http';
import type { Env } from '../../core/platform';
import { canManageRepository as membership, pullRepository as repo } from '../context';
import { commitPullUpdate } from '../realtime/updates';
import { reviewBody } from '../../http/request-schemas';
import { referenceStatements } from '../../issues/references/work-items';
import { mentionStatements } from '../../issues/references/mentions';

export async function reviewPull(
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
    `SELECT id, source_commit_id AS sourceCommitId, state FROM pull_requests WHERE repository_id = ? AND number = ?`
  )
    .bind(repository.id, number)
    .first<{ id: string; sourceCommitId: string; state: string }>();
  if (!pull || !['open', 'draft'].includes(pull.state))
    return problem(409, 'pull_request_not_open', 'Pull request is not open.');
  const body = await readJson(request, reviewBody);
  if (!body || !['commented', 'approved', 'changes_requested'].includes(String(body.state)))
    return problem(422, 'invalid_review', 'Review state is invalid.');
  if (body.commitId !== pull.sourceCommitId)
    return problem(409, 'pull_head_changed', 'The pull changed. Review the latest revision before submitting.');
  const id = identifier('review');
  const createdAt = new Date().toISOString();
  const reviewText = typeof body.body === 'string' ? body.body.slice(0, 20_000) : '';
  const review = {
    id,
    authorId: principal.id,
    author: principal.handle,
    authorDisplayName: principal.displayName,
    authorAvatarUrl: principal.avatarUrl,
    state: body.state,
    body: reviewText,
    bodyHtml: renderBody(reviewText, { owner, repository: name }, id),
    commitId: pull.sourceCommitId,
    createdAt
  };
  const references = await referenceStatements(
    env,
    principal,
    { kind: 'pull', id: pull.id, owner, repository: name },
    'comment',
    id,
    review.body
  );
  const mentions = await mentionStatements(
    env,
    principal,
    { kind: 'pull', id: pull.id },
    'pull_review',
    id,
    review.body,
    createdAt
  );
  try {
    const update = await commitPullUpdate(
      env,
      pull.id,
      'review.created',
      { timeline: [{ kind: 'review', value: review, createdAt }], refreshState: true },
      [
        env.DB.prepare(
          'INSERT INTO pull_request_reviews (id,pull_request_id,author_id,state,body,commit_id,created_at) VALUES (?,?,?,?,?,?,?)'
        ).bind(id, pull.id, principal.id, review.state, review.body, pull.sourceCommitId, createdAt),
        ...references,
        ...mentions
      ]
    );
    return json({ review, update }, { status: 201 });
  } catch (error) {
    if (String(error).includes('pull_head_changed'))
      return problem(409, 'pull_head_changed', 'The pull changed. Review the latest revision before submitting.');
    throw error;
  }
}
