import { describe, expect, test } from 'bun:test';
import { summarizePullRevisions, type RevisionBoundary, type RevisionReview, type RevisionTimelineRow } from './pull-revisions';

describe('pull revisions', () => {
  test('keeps each pushed head separate and uses the latest review outcome per person', () => {
    const boundaries: RevisionBoundary[] = [
      boundary(2, 'head-1', 'Introduce cache ordering'),
      boundary(7, 'head-2', 'Handle interrupted publication'),
      boundary(13, 'head-3', 'Name the stale-read guarantee', true)
    ];
    const rows: RevisionTimelineRow[] = [
      row(2, 'event', 'push-1'),
      row(3, 'thread', 'thread-1'),
      row(4, 'review', 'review-1'),
      row(5, 'review', 'review-2'),
      row(7, 'event', 'push-2'),
      row(8, 'comment', 'comment-1'),
      row(9, 'review', 'review-3'),
      row(13, 'event', 'push-3'),
      row(14, 'thread', 'thread-2')
    ];
    const reviews: RevisionReview[] = [
      { id: 'review-1', authorId: 'rhea', state: 'changes_requested' },
      { id: 'review-2', authorId: 'rhea', state: 'approved' },
      { id: 'review-3', authorId: 'noor', state: 'changes_requested' }
    ];

    const revisions = summarizePullRevisions(rows, boundaries, reviews, 'head-3');

    expect(revisions.map((revision) => revision.number)).toEqual([1, 2, 3]);
    expect(revisions[0]).toMatchObject({ commitId: 'head-1', activityCount: 3, conversationCount: 3, reviewState: 'approved', current: false });
    expect(revisions[1]).toMatchObject({ commitId: 'head-2', reviewState: 'changes_requested', current: false });
    expect(revisions[2]).toMatchObject({ commitId: 'head-3', forcePushed: true, current: true });
  });
});

function boundary(sequence: number, head: string, title: string, forcePushed = false): RevisionBoundary {
  return {
    sequence,
    actor: 'marl-lab',
    actorDisplayName: 'Marl Lab',
    details: { head, commits: JSON.stringify([{ id: head, title }]), forcePushed: String(forcePushed) },
    createdAt: `2026-09-03T10:${sequence.toString().padStart(2, '0')}:00.000Z`
  };
}

function row(sequence: number, kind: RevisionTimelineRow['kind'], entityId: string): RevisionTimelineRow {
  return { sequence, kind, entityId, createdAt: `2026-09-03T10:${sequence.toString().padStart(2, '0')}:00.000Z` };
}
