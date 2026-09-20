import type { IssueComment, IssueEvent, IssueTimelineItem, IssueTimelineWindow } from '@marl/contracts';

export type DiscussionComment = { comment: IssueComment; sequence?: number };
export type DiscussionThread = { kind: 'thread'; id: string; sequence: number; root: DiscussionComment; replies: DiscussionComment[] };
export type DiscussionItem = DiscussionThread | Exclude<IssueTimelineItem, { kind: 'comment' }>;

export function isDiscussionEvent(event: IssueEvent) {
  return event.kind === 'closed' || event.kind === 'reopened' || event.kind === 'closed_by_pull';
}

export function issueDiscussion(timeline: IssueTimelineWindow): DiscussionItem[] {
  const comments = new Map(timeline.context.map((comment) => [comment.id, { comment } as DiscussionComment]));
  for (const item of timeline.items) {
    if (item.kind === 'comment') comments.set(item.value.id, { comment: item.value, sequence: item.sequence });
  }
  const threads = new Map<string, DiscussionThread>();
  const events: DiscussionItem[] = [];
  for (const item of timeline.items.toSorted((left, right) => left.sequence - right.sequence)) {
    if (item.kind !== 'comment') {
      if (item.kind === 'reference' || isDiscussionEvent(item.value)) events.push(item);
      continue;
    }
    const rootId = item.value.parentId ?? item.value.id;
    let thread = threads.get(rootId);
    if (!thread) {
      const root = comments.get(rootId) ?? { comment: item.value, sequence: item.sequence };
      thread = { kind: 'thread', id: rootId, sequence: root.sequence ?? item.sequence, root, replies: [] };
      threads.set(rootId, thread);
    }
    if (item.value.id !== thread.root.comment.id) thread.replies.push({ comment: item.value, sequence: item.sequence });
  }
  return [...threads.values(), ...events].toSorted((left, right) => left.sequence - right.sequence);
}

export function issueEventCopy(event: IssueEvent) {
  if (event.kind === 'assigned') return `assigned @${event.details.handle}`;
  if (event.kind === 'unassigned') return `unassigned @${event.details.handle}`;
  if (event.kind === 'label_added') return `added ${event.details.label}`;
  if (event.kind === 'label_removed') return `removed ${event.details.label}`;
  return ({ title_changed: 'changed the title', description_changed: 'edited the description', locked: 'locked the conversation', unlocked: 'unlocked the conversation', closed: 'closed this issue', reopened: 'reopened this issue', closed_by_pull: 'closed this issue via' })[event.kind];
}

export function observeIssueDiscussion(node: HTMLElement, onRead: (sequence: number) => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let visible = new Set<Element>();
  const observed = new Set<Element>();
  const flush = () => {
    if (document.visibilityState !== 'visible') return;
    const sequences = [...visible].map((element) => Number((element as HTMLElement).dataset.readSequence));
    if (sequences.length) onRead(Math.max(...sequences));
  };
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) visible.add(entry.target);
      else visible.delete(entry.target);
    }
    clearTimeout(timer);
    timer = setTimeout(flush, 700);
  });
  const update = () => {
    for (const element of observed) {
      if (!node.contains(element)) {
        observer.unobserve(element);
        observed.delete(element);
        visible.delete(element);
      }
    }
    for (const element of node.querySelectorAll('[data-read-sequence]')) {
      if (observed.has(element)) continue;
      observed.add(element);
      observer.observe(element);
    }
  };
  const mutations = new MutationObserver(update);
  mutations.observe(node, { childList: true, subtree: true });
  document.addEventListener('visibilitychange', flush);
  update();
  return () => {
    clearTimeout(timer);
    observer.disconnect();
    mutations.disconnect();
    document.removeEventListener('visibilitychange', flush);
    visible = new Set();
  };
}
