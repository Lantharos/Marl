import type { Principal } from './auth';
import { json, problem } from './http';
import { deleteMentionStatements } from './mentions';
import type { Env } from './platform';
import { canDeletePullComment } from './pull-comment-access';
import { commitPullUpdate } from './pull-realtime';
import { deleteReferenceStatements } from './work-item-references';

export async function deleteReviewBody(env: Env, principal: Principal, reviewId: string) {
  const review = await env.DB.prepare('SELECT pull_request_id AS pullId,author_id AS authorId FROM pull_request_reviews WHERE id=?').bind(reviewId).first<{ pullId: string; authorId: string }>();
  if (!review || !(await canDeletePullComment(env, principal, review.pullId, review.authorId))) return problem(404, 'review_not_found', 'Review not found.');
  const update = await commitPullUpdate(env, review.pullId, 'review.body.deleted', { review: { id: reviewId, body: '' }, refreshState: true }, [
    env.DB.prepare("UPDATE pull_request_reviews SET body='' WHERE id=?").bind(reviewId),
    ...deleteReferenceStatements(env, 'comment', reviewId),
    ...deleteMentionStatements(env, 'pull_review', reviewId)
  ]);
  return json({ update });
}
