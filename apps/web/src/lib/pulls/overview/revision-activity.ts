import type { PullRevisionReviewer, PullTimelineItem } from '@marl/contracts';

export type ThreadItem = Extract<PullTimelineItem, { kind: 'thread' }>;
export type DiscussionItem = Extract<PullTimelineItem, { kind: 'comment' | 'thread' }>;
export type NoteItem = Extract<PullTimelineItem, { kind: 'event' | 'reference' }>;
type ReviewGroup = Extract<PullTimelineItem, { kind: 'review' }> & { threads: ThreadItem[] };
type NoteGroup = { kind: 'notes'; notes: NoteItem[] };
export type RevisionActivity = DiscussionItem | ReviewGroup | NoteGroup;

export function activityKey(item: RevisionActivity) {
  return item.kind === 'notes' ? `notes:${item.notes[0].value.id}` : `${item.kind}:${item.value.id}`;
}

export function groupRevisionActivity(newestFirst: PullTimelineItem[]): RevisionActivity[] {
  const activity: RevisionActivity[] = [];
  const submissions = new Map<string, Map<string, ReviewGroup>>();

  for (const item of newestFirst) {
    if (item.kind === 'event' || item.kind === 'reference') {
      const previous = activity.at(-1);
      if (previous?.kind === 'notes') previous.notes.push(item);
      else activity.push({ kind: 'notes', notes: [item] });
    } else if (item.kind === 'review') {
      const group: ReviewGroup = { ...item, threads: [] };
      activity.push(group);
      if (item.value.carriedFromReviewId) continue;
      let revisions = submissions.get(item.value.authorId);
      if (!revisions) {
        revisions = new Map();
        submissions.set(item.value.authorId, revisions);
      }
      revisions.set(item.value.commitId, group);
    } else if (item.kind === 'thread') {
      const authorId = item.value.comments[0]?.authorId;
      const group = authorId ? submissions.get(authorId)?.get(item.value.commitId) : undefined;
      if (group) group.threads.push(item);
      else activity.push(item);
    } else {
      activity.push(item);
    }
  }

  return activity;
}

export function revisionParticipation(newestFirst: PullTimelineItem[]) {
  const reviewers = new Map<string, PullRevisionReviewer>();
  let unresolvedCount = 0;
  for (const item of newestFirst) {
    if (item.kind === 'thread' && !item.value.resolved) unresolvedCount += 1;
    if (item.kind !== 'review' || reviewers.has(item.value.authorId)) continue;
    const review = item.value;
    reviewers.set(review.authorId, {
      id: review.authorId,
      handle: review.author,
      displayName: review.authorDisplayName,
      avatarUrl: review.authorAvatarUrl ?? null,
      kind: review.authorKind,
      state: review.state
    });
  }
  return { reviewers: [...reviewers.values()], unresolvedCount };
}
