import { route } from '../http/router';
import { approvePullChecks } from './merge/checks';
import { getPullMergeability } from './merge/mergeability';
import { addPullComment, deletePullComment, updatePullComment } from './comments';
import {
  addThreadComment,
  createThread,
  deleteReviewComment,
  resolveThread,
  updateReviewComment
} from './review/threads';
import { createPull, transitionPull, updatePullDetails } from './pulls';
import { createPullLabel, updatePullMetadata } from './metadata';
import { mergePull } from './merge/merge';
import { reviewPull } from './review/reviews';
import { compareBranches, getPullDiff, getPullPatch } from './comparison';
import {
  connectPullRealtime,
  getPull,
  getPullState,
  getPullTimeline,
  getPullUpdates,
  listAllPulls,
  listPulls
} from './queries';
import { deleteReviewBody } from './review/comments';

const pulls = '/repositories/:owner/:repo/pulls';
const pull = `${pulls}/:number(\\d+)`;
const comment = ':id(comment_[a-z0-9]+)';

export const pullRoutes = [
  route('GET', '/pulls', 'user', ({ env, principal, url }) => listAllPulls(env, principal, url)),
  route('GET', '/repositories/:owner/:repo/compare', 'user', ({ env, principal, url }, { owner, repo }) =>
    compareBranches(env, principal, owner, repo, url)
  ),
  route('GET', pulls, 'optional', ({ env, principal, url }, { owner, repo }) =>
    listPulls(env, principal, owner, repo, url)
  ),
  route('POST', pulls, 'user', ({ request, env, principal }, { owner, repo }) =>
    createPull(request, env, principal, owner, repo)
  ),
  route('GET', pull, 'optional', ({ env, principal }, { owner, repo, number }) =>
    getPull(env, principal, owner, repo, Number(number))
  ),
  route('PATCH', pull, 'user', ({ request, env, principal }, { owner, repo, number }) =>
    updatePullDetails(request, env, principal, owner, repo, Number(number))
  ),
  route('GET', `${pull}/diff`, 'optional', ({ env, principal, url }, { owner, repo, number }) =>
    getPullDiff(env, principal, owner, repo, Number(number), url)
  ),
  route('GET', `${pull}/patch`, 'optional', ({ env, principal, url }, { owner, repo, number }) =>
    getPullPatch(env, principal, owner, repo, Number(number), url)
  ),
  route('GET', `${pull}/timeline`, 'optional', ({ env, principal, url }, { owner, repo, number }) =>
    getPullTimeline(env, principal, owner, repo, Number(number), url)
  ),
  route('GET', `${pull}/updates`, 'optional', ({ env, principal, url }, { owner, repo, number }) =>
    getPullUpdates(env, principal, owner, repo, Number(number), url)
  ),
  route('GET', `${pull}/live`, 'optional', ({ request, env, principal }, { owner, repo, number }) =>
    connectPullRealtime(request, env, principal, owner, repo, Number(number))
  ),
  route('GET', `${pull}/state`, 'optional', ({ env, principal }, { owner, repo, number }) =>
    getPullState(env, principal, owner, repo, Number(number))
  ),
  route('GET', `${pull}/mergeability`, 'optional', ({ env, principal, url }, { owner, repo, number }) =>
    getPullMergeability(env, principal, owner, repo, Number(number), url)
  ),
  route('POST', `${pull}/reviews`, 'user', ({ request, env, principal }, { owner, repo, number }) =>
    reviewPull(request, env, principal, owner, repo, Number(number))
  ),
  route('POST', `${pull}/merge`, 'user', ({ request, env, principal }, { owner, repo, number }) =>
    mergePull(request, env, principal, owner, repo, Number(number))
  ),
  route('POST', `${pull}/threads`, 'user', ({ request, env, principal }, { owner, repo, number }) =>
    createThread(request, env, principal, owner, repo, Number(number))
  ),
  route('POST', `${pull}/comments`, 'user', ({ request, env, principal }, { owner, repo, number }) =>
    addPullComment(request, env, principal, owner, repo, Number(number))
  ),
  route('PATCH', `${pull}/metadata`, 'user', ({ request, env, principal }, { owner, repo, number }) =>
    updatePullMetadata(request, env, principal, owner, repo, Number(number))
  ),
  route('POST', `${pull}/labels`, 'user', ({ request, env, principal }, { owner, repo, number }) =>
    createPullLabel(request, env, principal, owner, repo, Number(number))
  ),
  route('POST', `${pull}/approve-checks`, 'user', ({ request, env, principal }, { owner, repo, number }) =>
    approvePullChecks(request, env, principal, owner, repo, Number(number))
  ),
  route('POST', `${pull}/:action(ready|close|reopen)`, 'user', ({ env, principal }, params) =>
    transitionPull(
      env,
      principal,
      params.owner,
      params.repo,
      Number(params.number),
      params.action as 'ready' | 'close' | 'reopen'
    )
  ),
  route('POST', '/review-threads/:id(thread_[a-z0-9]+)/resolve', 'user', ({ request, env, principal }, { id }) =>
    resolveThread(request, env, principal, id)
  ),
  route('POST', '/review-threads/:id(thread_[a-z0-9]+)/comments', 'user', ({ request, env, principal }, { id }) =>
    addThreadComment(request, env, principal, id)
  ),
  route('PATCH', `/review-comments/${comment}`, 'user', ({ request, env, principal }, { id }) =>
    updateReviewComment(request, env, principal, id)
  ),
  route('DELETE', `/review-comments/${comment}`, 'user', ({ env, principal }, { id }) =>
    deleteReviewComment(env, principal, id)
  ),
  route('PATCH', `/pull-comments/${comment}`, 'user', ({ request, env, principal }, { id }) =>
    updatePullComment(request, env, principal, id)
  ),
  route('DELETE', `/pull-comments/${comment}`, 'user', ({ env, principal }, { id }) =>
    deletePullComment(env, principal, id)
  ),
  route('DELETE', '/pull-reviews/:id(review_[a-z0-9]+)/body', 'user', ({ env, principal }, { id }) =>
    deleteReviewBody(env, principal, id)
  )
];
