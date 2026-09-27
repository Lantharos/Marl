import type {
  IssueComment,
  IssueDetail,
  IssueEvent,
  IssueTimelineItem,
  IssueTimelineWindow,
  WorkItemLabel
} from '@marl/contracts';
import { api, MarlApiError } from '$lib/api';

type SavedEvent = { kind: 'event'; value: IssueEvent; sequence: number };
type MetadataUpdate = { assigneeIds?: string[]; labelIds?: string[]; locked?: boolean };

export class IssuePageState {
  #source: () => { issue: IssueDetail; endpoint: string; signedIn: boolean };
  issue: IssueDetail;
  timeline: IssueTimelineWindow;
  busy = $state(false);
  error = $state('');
  #pendingRead = 0;
  #reading = false;

  constructor(source: () => { issue: IssueDetail; endpoint: string; signedIn: boolean }) {
    this.#source = source;
    this.issue = $derived(source().issue);
    this.timeline = $derived(source().issue.timeline);
  }

  get endpoint() {
    return this.#source().endpoint;
  }

  async run(action: () => Promise<void>) {
    if (this.busy) return false;
    this.busy = true;
    this.error = '';
    try {
      await action();
      return true;
    } catch (cause) {
      this.error = cause instanceof MarlApiError ? cause.message : 'The issue could not be updated.';
      return false;
    } finally {
      this.busy = false;
    }
  }

  #append(kind: 'comment' | 'event', value: IssueComment | IssueEvent, sequence: number) {
    this.timeline = {
      ...this.timeline,
      items: [...this.timeline.items, { sequence, kind, createdAt: value.createdAt, value } as IssueTimelineItem],
      total: this.timeline.total + 1
    };
  }

  #appendEvents(items: SavedEvent[]) {
    for (const item of items) this.#append('event', item.value, item.sequence);
  }

  #updateComment(id: string, patch: Partial<IssueComment>) {
    this.timeline = {
      ...this.timeline,
      items: this.timeline.items.map((item) =>
        item.kind === 'comment' && item.value.id === id ? { ...item, value: { ...item.value, ...patch } } : item
      ),
      context: this.timeline.context.map((item) => (item.id === id ? { ...item, ...patch } : item))
    };
  }

  addComment = (body: string, replyToId?: string) => {
    if (!body.trim()) return Promise.resolve(false);
    return this.run(async () => {
      const result = await api<{ comment: IssueComment; sequence: number; linkedItems: IssueDetail['linkedItems'] }>(
        `${this.endpoint}/comments`,
        { method: 'POST', body: JSON.stringify({ body: body.trim(), replyToId }) }
      );
      this.#append('comment', result.comment, result.sequence);
      this.issue = {
        ...this.issue,
        linkedItems: result.linkedItems,
        commentCount: this.issue.commentCount + 1,
        updatedAt: result.comment.createdAt
      };
    });
  };

  saveComment = (id: string, body: string) => {
    if (!body.trim()) return Promise.resolve(false);
    return this.run(async () => {
      const result = await api<{
        comment: Pick<IssueComment, 'body' | 'bodyHtml' | 'updatedAt'>;
        linkedItems: IssueDetail['linkedItems'];
      }>(`/issue-comments/${id}`, { method: 'PATCH', body: JSON.stringify({ body: body.trim() }) });
      this.#updateComment(id, result.comment);
      this.issue = { ...this.issue, linkedItems: result.linkedItems };
    });
  };

  deleteComment = (id: string) =>
    this.run(async () => {
      const result = await api<{ updatedAt: string; linkedItems: IssueDetail['linkedItems'] }>(
        `/issue-comments/${id}`,
        {
          method: 'DELETE'
        }
      );
      this.#updateComment(id, { body: '', bodyHtml: '', deleted: true, updatedAt: result.updatedAt });
      this.issue = {
        ...this.issue,
        linkedItems: result.linkedItems,
        commentCount: Math.max(0, this.issue.commentCount - 1)
      };
    });

  changeState = () =>
    this.run(async () => {
      const state = this.issue.state === 'open' ? 'closed' : 'open';
      const result = await api<{ state: 'open' | 'closed'; timeline: SavedEvent }>(`${this.endpoint}/state`, {
        method: 'POST',
        body: JSON.stringify({ state })
      });
      this.issue = { ...this.issue, state: result.state };
      this.#append('event', result.timeline.value, result.timeline.sequence);
    });

  saveDetails = (title: string, body: string) =>
    this.run(async () => {
      const result = await api<{
        issue: Pick<IssueDetail, 'title' | 'body' | 'bodyHtml'>;
        linkedItems: IssueDetail['linkedItems'];
        timeline: SavedEvent[];
      }>(this.endpoint, { method: 'PATCH', body: JSON.stringify({ title, body }) });
      this.issue = { ...this.issue, ...result.issue, linkedItems: result.linkedItems };
      this.#appendEvents(result.timeline);
    });

  updateMetadata = async (update: MetadataUpdate) => {
    await this.run(async () => {
      const result = await api<{ timeline: SavedEvent[] }>(`${this.endpoint}/metadata`, {
        method: 'PATCH',
        body: JSON.stringify(update)
      });
      this.issue = {
        ...this.issue,
        ...(update.assigneeIds
          ? { assignees: this.issue.availableAssignees.filter((person) => update.assigneeIds?.includes(person.id)) }
          : {}),
        ...(update.labelIds
          ? { labels: this.issue.availableLabels.filter((label) => update.labelIds?.includes(label.id)) }
          : {}),
        ...(update.locked !== undefined ? { locked: update.locked } : {})
      };
      this.#appendEvents(result.timeline);
    });
  };

  createLabel = async (name: string) => {
    await this.run(async () => {
      const result = await api<{ label: WorkItemLabel }>(`${this.endpoint}/labels`, {
        method: 'POST',
        body: JSON.stringify({ name })
      });
      if (!this.issue.availableLabels.some((label) => label.id === result.label.id))
        this.issue = {
          ...this.issue,
          availableLabels: [...this.issue.availableLabels, result.label].toSorted((left, right) =>
            left.name.localeCompare(right.name)
          )
        };
    });
  };

  loadOlder = () => {
    const timeline = this.timeline;
    if (!timeline.loadBeforeSequence || timeline.firstBoundarySequence === undefined) return Promise.resolve(false);
    return this.run(async () => {
      const result = await api<{ timeline: IssueTimelineWindow }>(
        `${this.endpoint}/timeline?before=${timeline.loadBeforeSequence}&after=${timeline.firstBoundarySequence}`
      );
      const items = [...this.timeline.items, ...result.timeline.items];
      this.timeline = {
        ...this.timeline,
        items: [...new Map(items.map((item) => [item.sequence, item])).values()].toSorted(
          (left, right) => left.sequence - right.sequence
        ),
        context: [
          ...new Map([...this.timeline.context, ...result.timeline.context].map((item) => [item.id, item])).values()
        ],
        hidden: result.timeline.hidden,
        loadBeforeSequence: result.timeline.loadBeforeSequence
      };
    });
  };

  saveConclusion = (body: string, commentId: string | null) =>
    this.run(async () => {
      const result = await api<{ conclusion: IssueDetail['conclusion'] }>(`${this.endpoint}/conclusion`, {
        method: 'PATCH',
        body: JSON.stringify({ body: body.trim(), commentId })
      });
      this.issue = { ...this.issue, conclusion: result.conclusion };
    });

  linkPull = (pullNumber: number) =>
    this.run(async () => {
      const result = await api<{ linkedItems: IssueDetail['linkedItems'] }>(`${this.endpoint}/links`, {
        method: 'POST',
        body: JSON.stringify({ pullNumber })
      });
      this.issue = { ...this.issue, linkedItems: result.linkedItems };
    });

  toggleFollowing = async () => {
    await this.run(async () => {
      const result = await api<{ participation: IssueDetail['participation'] }>(`${this.endpoint}/participation`, {
        method: 'PATCH',
        body: JSON.stringify({ following: !this.issue.participation.following })
      });
      this.issue = {
        ...this.issue,
        participation: {
          ...result.participation,
          lastReadSequence: Math.max(this.issue.participation.lastReadSequence, result.participation.lastReadSequence)
        },
        following: result.participation.following
      };
    });
  };

  markRead = async (sequence: number) => {
    if (!this.#source().signedIn) return;
    const timeline = this.timeline;
    const limit =
      timeline.hidden > 0 && this.issue.participation.lastReadSequence < (timeline.loadBeforeSequence ?? 0) - 1
        ? (timeline.firstBoundarySequence ?? 0)
        : Infinity;
    this.#pendingRead = Math.max(this.#pendingRead, Math.min(sequence, limit));
    if (this.#reading || this.#pendingRead <= this.issue.participation.lastReadSequence) return;
    this.#reading = true;
    const issueId = this.issue.id;
    try {
      while (this.issue.id === issueId && this.#pendingRead > this.issue.participation.lastReadSequence) {
        const result = await api<{ participation: IssueDetail['participation'] }>(`${this.endpoint}/participation`, {
          method: 'PATCH',
          body: JSON.stringify({ lastReadSequence: this.#pendingRead })
        });
        if (this.issue.id === issueId)
          this.issue = {
            ...this.issue,
            participation: {
              ...this.issue.participation,
              lastReadSequence: Math.max(
                this.issue.participation.lastReadSequence,
                result.participation.lastReadSequence
              )
            }
          };
      }
    } catch {
      if (this.issue.id === issueId) this.error = 'Your reading position could not be saved.';
    } finally {
      this.#reading = false;
    }
  };
}
