import type { PullRevisionSummary, PullRevisionWindow, PullTimelineItem, PullTimelineWindow, ReviewThread } from '@marl/contracts';
import { SvelteMap } from 'svelte/reactivity';

type TimelineKind = PullTimelineItem['kind'];

function timelineKey(kind: TimelineKind, id: string) {
  return `${kind}:${id}`;
}

export class PullTimelineState {
  readonly items = new SvelteMap<string, PullTimelineItem>();
  readonly revisionOrders = new SvelteMap<number, string[]>();
  order = $state<string[]>([]);
  revisions = $state.raw<PullRevisionSummary[]>([]);
  total = $state(0);

  constructor(window: PullTimelineWindow) {
    this.replace(window);
  }

  replace(window: PullTimelineWindow) {
    this.items.clear();
    this.revisionOrders.clear();
    for (const item of window.items) this.items.set(timelineKey(item.kind, item.value.id), item);
    this.order = this.sortedKeys(window.items);
    this.revisions = window.revisions;
    this.total = window.total;
  }

  get(kind: TimelineKind, id: string) {
    return this.items.get(timelineKey(kind, id));
  }

  getThread(id: string) {
    return this.get('thread', id)?.value as ReviewThread | undefined;
  }

  patch(kind: TimelineKind, id: string, patch: Record<string, unknown>) {
    const key = timelineKey(kind, id);
    const item = this.items.get(key);
    if (!item) return;
    this.items.set(key, { ...item, value: { ...item.value, ...patch } } as PullTimelineItem);
  }

  restore(item: PullTimelineItem | undefined) {
    if (item) this.items.set(timelineKey(item.kind, item.value.id), item);
  }

  append(entries: unknown[]) {
    if (!entries.length) return;
    let sequence = Math.max(this.revisions.at(-1)?.sequence ?? 0, ...this.order.map((key) => this.items.get(key)?.sequence ?? 0)) + 1;
    const added: string[] = [];
    for (const entry of entries) {
      const candidate = entry as { kind?: TimelineKind; value?: { id?: string; kind?: string }; createdAt?: string };
      if (!candidate.kind || !candidate.value?.id || !candidate.createdAt || candidate.value.kind === 'commits_added') continue;
      const key = timelineKey(candidate.kind, candidate.value.id);
      if (this.items.has(key)) continue;
      this.items.set(key, { sequence: sequence++, kind: candidate.kind, value: candidate.value, createdAt: candidate.createdAt } as PullTimelineItem);
      added.push(key);
    }
    if (!added.length) return;
    this.order = [...added.toReversed(), ...this.order];
    this.total += added.length;
  }

  loadRevision(window: PullRevisionWindow) {
    for (const item of window.items) this.items.set(timelineKey(item.kind, item.value.id), item);
    this.revisionOrders.set(window.sequence, this.sortedKeys(window.items));
  }

  revisionLoaded(sequence: number) {
    return this.revisionOrders.has(sequence);
  }

  revisionItems(sequence: number) {
    return (this.revisionOrders.get(sequence) ?? []).flatMap((key) => {
      const item = this.items.get(key);
      return item ? [item] : [];
    });
  }

  private sortedKeys(items: PullTimelineItem[]) {
    return [...items]
      .sort((left, right) => right.sequence - left.sequence)
      .map((item) => timelineKey(item.kind, item.value.id));
  }
}
