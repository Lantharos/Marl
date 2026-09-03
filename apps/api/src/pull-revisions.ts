import type { PullRevisionSummary, PullRequestReview } from '@marl/contracts';

export type RevisionTimelineRow = {
  sequence: number;
  kind: 'comment' | 'review' | 'thread' | 'event' | 'reference';
  entityId: string;
  createdAt: string;
};

export type RevisionBoundary = {
  sequence: number;
  actor: string;
  actorDisplayName: string;
  details: Record<string, string>;
  createdAt: string;
};

export type RevisionReview = Pick<PullRequestReview, 'id' | 'state'> & { authorId: string };

type TimelineCommit = { id: string; title: string };

export function summarizePullRevisions(rows: RevisionTimelineRow[], boundaries: RevisionBoundary[], reviews: RevisionReview[], currentHead: string): PullRevisionSummary[] {
  const orderedBoundaries = [...boundaries].sort((left, right) => left.sequence - right.sequence);
  const reviewById = new Map(reviews.map((review) => [review.id, review]));

  return orderedBoundaries.map((boundary, index) => {
    const nextSequence = orderedBoundaries[index + 1]?.sequence ?? Number.POSITIVE_INFINITY;
    const activity = rows.filter((row) => row.sequence > boundary.sequence && row.sequence < nextSequence);
    const latestReviews = new Map<string, RevisionReview['state']>();
    for (const row of activity) {
      if (row.kind !== 'review') continue;
      const review = reviewById.get(row.entityId);
      if (review) latestReviews.set(review.authorId, review.state);
    }
    const states = [...latestReviews.values()];
    const commits = parseCommits(boundary.details.commits);
    const current = index === orderedBoundaries.length - 1;
    return {
      sequence: boundary.sequence,
      number: index + 1,
      commitId: current ? currentHead : boundary.details.head || commits.at(-1)?.id || '',
      title: commits.at(-1)?.title || 'Revision update',
      actor: boundary.actor,
      actorDisplayName: boundary.actorDisplayName,
      createdAt: boundary.createdAt,
      commitCount: commits.length,
      activityCount: activity.length,
      conversationCount: activity.filter((row) => row.kind === 'comment' || row.kind === 'review' || row.kind === 'thread').length,
      reviewState: states.includes('changes_requested') ? 'changes_requested' : states.includes('approved') ? 'approved' : states.includes('commented') ? 'commented' : 'none',
      forcePushed: boundary.details.forcePushed === 'true',
      current
    };
  });
}

function parseCommits(value?: string): TimelineCommit[] {
  try {
    const parsed = JSON.parse(value ?? '[]') as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((commit): commit is TimelineCommit => Boolean(commit && typeof commit === 'object' && typeof (commit as TimelineCommit).id === 'string' && typeof (commit as TimelineCommit).title === 'string'))
      : [];
  } catch {
    return [];
  }
}
