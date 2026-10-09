import type { PullRequestEvent, WorkItemReferenceEvent } from '@marl/contracts';
import type { NoteItem } from './revision-activity';

type Change = { added: string[]; removed: string[] };
export type NoteRow =
  | { kind: 'event'; key: string; event: PullRequestEvent }
  | { kind: 'labels' | 'assignees'; key: string; event: PullRequestEvent; change: Change }
  | { kind: 'reference'; key: string; reference: WorkItemReferenceEvent };

const families = {
  label_added: ['labels', 'added', 'label'],
  label_removed: ['labels', 'removed', 'label'],
  assigned: ['assignees', 'added', 'handle'],
  unassigned: ['assignees', 'removed', 'handle']
} as const;

const milestones = new Set<PullRequestEvent['kind']>(['merged', 'closed', 'reopened', 'force_pushed', 'dequeued']);

export function isMilestone(row: NoteRow) {
  return row.kind === 'event' && milestones.has(row.event.kind);
}

export function noteRows(notes: NoteItem[]): NoteRow[] {
  const rows: NoteRow[] = [];
  for (const note of notes) {
    if (note.kind === 'reference') {
      rows.push({ kind: 'reference', key: note.value.id, reference: note.value });
      continue;
    }
    const event = note.value;
    const family = families[event.kind as keyof typeof families];
    if (!family) {
      rows.push({ kind: 'event', key: event.id, event });
      continue;
    }
    const [kind, direction, field] = family;
    const previous = rows.at(-1);
    const sameActor = previous?.kind === kind && previous.event.actor === event.actor;
    const change = sameActor ? previous.change : { added: [], removed: [] };
    if (!change[direction].includes(event.details[field])) change[direction].push(event.details[field]);
    if (!sameActor) rows.push({ kind, key: event.id, event, change });
  }
  return rows;
}

export function eventPhrase(event: PullRequestEvent) {
  switch (event.kind) {
    case 'title_changed':
      return `changed the title to “${event.details.to}”`;
    case 'description_changed':
      return 'edited the description';
    case 'locked':
      return 'locked the conversation';
    case 'unlocked':
      return 'unlocked the conversation';
    case 'ready':
      return 'marked this pull ready for review';
    case 'closed':
      return 'closed this pull';
    case 'reopened':
      return 'reopened this pull';
    case 'merged':
      return `merged this pull with ${event.details.method}`;
    case 'head_updated':
      return 'pushed to this revision';
    case 'queued':
      return `queued this pull for ${event.details.target}`;
    case 'dequeued':
      return event.details.reason
        ? `queued this pull, but the merge stopped. ${event.details.reason}`
        : 'removed this pull from the merge queue';
    case 'force_pushed':
      return `force-pushed ${event.details.branch}`;
    default:
      return '';
  }
}
