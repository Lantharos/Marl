import type { Principal } from './auth';
import { identifier } from './domain';
import type { Env } from './platform';

export function revisionUpdateStatements(env: Env, pullId: string, previousHead: string, head: string, actor: Pick<Principal, 'id'>, details: Record<string, string>) {
  const createdAt = new Date().toISOString();
  return [
    env.DB.prepare(`INSERT INTO pull_request_events (id,pull_request_id,actor_id,kind,details,created_at)
      SELECT ?,?,?,CASE WHEN NOT EXISTS (SELECT 1 FROM pull_timeline JOIN pull_request_events ON pull_request_events.id=pull_timeline.entity_id WHERE pull_timeline.pull_request_id=? AND pull_request_events.kind='commits_added')
        OR EXISTS (SELECT 1 FROM pull_timeline WHERE pull_request_id=? AND kind IN ('comment','review','thread') AND sequence>COALESCE((SELECT MAX(boundary.sequence) FROM pull_timeline AS boundary JOIN pull_request_events ON pull_request_events.id=boundary.entity_id WHERE boundary.pull_request_id=? AND pull_request_events.kind='commits_added'),0))
        THEN 'commits_added' ELSE 'head_updated' END,?,?`).bind(identifier('event'), pullId, actor.id, pullId, pullId, pullId, JSON.stringify(details), createdAt),
    env.DB.prepare(`INSERT INTO pull_request_reviews (id,pull_request_id,author_id,state,body,commit_id,created_at,carried_from_review_id)
      SELECT 'review_' || lower(hex(randomblob(16))),?,review.author_id,'approved','',?,?,review.id
      FROM pull_request_reviews AS review JOIN pull_requests AS pull ON pull.id=review.pull_request_id
      WHERE review.pull_request_id=? AND review.commit_id=? AND review.state='approved' AND review.author_id!=pull.author_id
        AND COALESCE((SELECT carry_approvals_forward FROM branch_rules WHERE repository_id=pull.repository_id AND pattern IN (pull.target_branch,'*') ORDER BY pattern='*' LIMIT 1),0)=1
        AND NOT EXISTS (SELECT 1 FROM pull_request_reviews AS newer WHERE newer.pull_request_id=review.pull_request_id AND newer.commit_id=review.commit_id AND newer.author_id=review.author_id AND (newer.created_at>review.created_at OR (newer.created_at=review.created_at AND newer.id>review.id)))
        AND NOT EXISTS (SELECT 1 FROM pull_request_reviews AS current WHERE current.pull_request_id=review.pull_request_id AND current.commit_id=? AND current.author_id=review.author_id)
      ORDER BY review.created_at,review.id`).bind(pullId, head, createdAt, pullId, previousHead, head)
  ];
}
