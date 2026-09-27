import type { WebhookEvent } from '@marl/contracts';
import type { Env } from '../core/platform';
import { emitRepositoryEvent } from './events';

type TimelineEntry = { kind: string; value: { id: string; author?: string; actor?: string } };

const pullUpdates: Record<string, [WebhookEvent, string]> = {
  'pull.closed': ['pull', 'closed'],
  'pull.reopened': ['pull', 'reopened'],
  'pull.merged': ['pull', 'merged'],
  'pull.ready': ['pull', 'ready_for_review'],
  'pull.synchronized': ['pull', 'synchronized'],
  'review.created': ['review', 'submitted'],
  'comment.created': ['comment', 'created']
};

export async function emitPullUpdate(env: Env, pullId: string, kind: string, payload: { timeline?: TimelineEntry[] }) {
  const mapping = pullUpdates[kind];
  if (!mapping) return;
  const pull = await env.DB.prepare('SELECT repository_id AS repositoryId FROM pull_requests WHERE id=?')
    .bind(pullId)
    .first<{ repositoryId: string }>();
  if (!pull) return;
  const [event, action] = mapping;
  const entry = payload.timeline?.[0]?.value;
  const subject =
    event === 'review' && entry
      ? { kind: 'review' as const, id: entry.id }
      : event === 'comment' && entry
        ? { kind: 'comment' as const, id: entry.id, on: 'pull' as const }
        : { kind: 'pull' as const, id: pullId };
  await emitRepositoryEvent(env, pull.repositoryId, event, action, subject, entry?.author ?? entry?.actor ?? null);
}
