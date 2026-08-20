import type { PullTimelineItem, PullTimelineWindow, ReviewThread } from '@marl/contracts';
import { SvelteMap } from 'svelte/reactivity';

type TimelineKind = PullTimelineItem['kind'];

function timelineKey(kind: TimelineKind, id: string) {
  return `${kind}:${id}`;
}

export class PullTimelineState {
  readonly items = new SvelteMap<string, PullTimelineItem>();
  order = $state<string[]>([]);
  total = $state(0);
  hidden = $state(0);
  firstBoundarySequence = $state<number | undefined>();
  loadBeforeSequence = $state<number | undefined>();
  newestLoadedSequence = $state<number | undefined>();

  constructor(window: PullTimelineWindow) {
    this.replace(window);
  }

  replace(window: PullTimelineWindow) {
    this.items.clear();
    for (const item of window.items) this.items.set(timelineKey(item.kind, item.value.id), item);
    this.order = [...this.items.keys()].sort((left, right) => this.items.get(left)!.sequence - this.items.get(right)!.sequence);
    this.applyWindow(window);
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
    let sequence = (this.newestLoadedSequence ?? 0) + 1;
    const added: string[] = [];
    for (const entry of entries) {
      const candidate = entry as { kind?: TimelineKind; value?: { id?: string }; createdAt?: string };
      if (!candidate.kind || !candidate.value?.id || !candidate.createdAt) continue;
      const key = timelineKey(candidate.kind, candidate.value.id);
      if (this.items.has(key)) continue;
      this.items.set(key, { sequence: sequence++, kind: candidate.kind, value: candidate.value, createdAt: candidate.createdAt } as PullTimelineItem);
      added.push(key);
    }
    if (!added.length) return;
    this.order = [...this.order, ...added];
    this.total += added.length;
    this.newestLoadedSequence = sequence - 1;
  }

  remove(entries: unknown[]) {
    const keys = [...new Set(entries.flatMap((entry) => {
      const candidate = entry as { kind?: TimelineKind; id?: string };
      return candidate.kind && candidate.id ? [timelineKey(candidate.kind, candidate.id)] : [];
    }))];
    if (!keys.length) return;
    const removedLoaded = keys.filter((key) => this.items.delete(key)).length;
    const removedHidden = Math.max(0, keys.length - removedLoaded);
    this.order = this.order.filter((key) => this.items.has(key));
    this.total = Math.max(0, this.total - keys.length);
    this.hidden = Math.max(0, this.hidden - removedHidden);
  }

  mergeOlder(window: PullTimelineWindow) {
    for (const item of window.items) this.items.set(timelineKey(item.kind, item.value.id), item);
    this.order = [...this.items.keys()].sort((left, right) => this.items.get(left)!.sequence - this.items.get(right)!.sequence);
    this.hidden = window.hidden;
    this.loadBeforeSequence = window.loadBeforeSequence;
  }

  private applyWindow(window: PullTimelineWindow) {
    this.total = window.total;
    this.hidden = window.hidden;
    this.firstBoundarySequence = window.firstBoundarySequence;
    this.loadBeforeSequence = window.loadBeforeSequence;
    this.newestLoadedSequence = window.newestLoadedSequence;
  }
}
