import type { PullRealtimeUpdate, PullRequestDetail, PullRequestDiff, ReviewThread } from '@marl/contracts';
import type { PullTimelineState } from '../timeline/PullTimelineState.svelte';

type Label = PullRequestDetail['labels'][number];
type Entity = { id: string } & Record<string, unknown>;
type ThreadComment = { threadId: string; comment: Entity };

function upsertComment(comments: ReviewThread['comments'], comment: Entity) {
  return comments.some((item) => item.id === comment.id)
    ? comments.map((item) => (item.id === comment.id ? { ...item, ...comment } : item))
    : [...comments, comment as unknown as ReviewThread['comments'][number]];
}

function patchDiffThread(
  diff: PullRequestDiff | null,
  id: string,
  patch: (thread: ReviewThread) => Partial<ReviewThread>
) {
  if (!diff?.threads?.some((thread) => thread.id === id)) return diff;
  return {
    ...diff,
    threads: diff.threads.map((thread) => (thread.id === id ? { ...thread, ...patch(thread) } : thread))
  };
}

function withLabel(pull: PullRequestDetail, label: Label) {
  if (pull.availableLabels.some((item) => item.id === label.id)) return pull;
  return {
    ...pull,
    availableLabels: [...pull.availableLabels, label].sort((left, right) => left.name.localeCompare(right.name))
  };
}

function withMetadata(
  pull: PullRequestDetail,
  metadata: { assigneeIds?: string[]; labelIds?: string[]; locked?: boolean }
) {
  return {
    ...pull,
    assignees: metadata.assigneeIds
      ? pull.availableAssignees.filter((person) => metadata.assigneeIds?.includes(person.id))
      : pull.assignees,
    labels: metadata.labelIds
      ? pull.availableLabels.filter((label) => metadata.labelIds?.includes(label.id))
      : pull.labels,
    locked: metadata.locked ?? pull.locked
  };
}

export function applyPullUpdate(
  current: PullRequestDetail,
  timeline: PullTimelineState,
  currentDiff: PullRequestDiff | null,
  update: PullRealtimeUpdate
) {
  const payload = update.payload;
  let pull = current;
  let diff = currentDiff;
  if (payload.details) pull = { ...pull, ...(payload.details as Partial<PullRequestDetail>) };
  if (payload.pull) pull = { ...pull, ...(payload.pull as Partial<PullRequestDetail>) };
  if (payload.label) pull = withLabel(pull, payload.label as Label);
  if (payload.metadata) pull = withMetadata(pull, payload.metadata as Parameters<typeof withMetadata>[1]);
  if (payload.review) timeline.patch('review', (payload.review as Entity).id, payload.review as Entity);
  if (payload.comment) timeline.patch('comment', (payload.comment as Entity).id, payload.comment as Entity);
  if (payload.thread) {
    const thread = payload.thread as Entity;
    timeline.patch('thread', thread.id, thread);
    diff = patchDiffThread(diff, thread.id, () => thread as Partial<ReviewThread>);
  }
  if (payload.threadComment) {
    const { threadId, comment } = payload.threadComment as ThreadComment;
    const thread = timeline.getThread(threadId);
    if (thread) timeline.patch('thread', threadId, { comments: upsertComment(thread.comments, comment) });
    diff = patchDiffThread(diff, threadId, (item) => ({ comments: upsertComment(item.comments, comment) }));
  }
  if (Array.isArray(payload.timeline)) timeline.append(payload.timeline);
  return { pull: { ...pull, realtimeVersion: update.version }, diff };
}
