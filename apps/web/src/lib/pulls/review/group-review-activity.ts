import type { PullTimelineItem } from '@marl/contracts';

export type DiscussionItem = Exclude<PullTimelineItem, { kind: 'review' }>;
export type ThreadItem = Extract<PullTimelineItem, { kind: 'thread' }>;
type ReviewGroup = Extract<PullTimelineItem, { kind: 'review' }> & { threads: ThreadItem[] };
type ActivityItem = DiscussionItem | ReviewGroup;

export function groupReviewActivity(newestFirst: PullTimelineItem[]): ActivityItem[] {
  const activity: ActivityItem[] = [];
  const submissions = new Map<string, Map<string, ReviewGroup>>();

  for (const item of newestFirst) {
    if (item.kind === 'review') {
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
