import type { IdentityKind } from './identity';
import type { Identifier, IssueState } from './common';
import type { RepositorySummary } from './repositories';
import type { LinkedWorkItem, WorkItemLabel, WorkItemPerson, WorkItemReferenceEvent } from './work-items';

export interface IssueSummary {
  id: Identifier;
  number: number;
  repository: Pick<RepositorySummary, 'owner' | 'name'>;
  title: string;
  author: string;
  authorDisplayName: string;
  authorAvatarUrl?: string | null;
  authorKind?: IdentityKind;
  state: IssueState;
  labels: WorkItemLabel[];
  assignees: WorkItemPerson[];
  commentCount: number;
  following: boolean;
  unread: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IssueComment {
  id: Identifier;
  parentId: Identifier | null;
  replyToId: Identifier | null;
  authorId: Identifier;
  author: string;
  authorDisplayName: string;
  authorAvatarUrl?: string | null;
  authorKind?: IdentityKind;
  body: string;
  bodyHtml: string;
  createdAt: string;
  updatedAt: string;
  deleted: boolean;
  canEdit: boolean;
}

export interface IssueEvent {
  id: Identifier;
  actor: string;
  actorDisplayName: string;
  kind:
    | 'title_changed'
    | 'description_changed'
    | 'assigned'
    | 'unassigned'
    | 'label_added'
    | 'label_removed'
    | 'locked'
    | 'unlocked'
    | 'closed'
    | 'reopened'
    | 'closed_by_pull';
  details: Record<string, string>;
  createdAt: string;
}

export type IssueTimelineItem =
  | {
      sequence: number;
      kind: 'comment';
      createdAt: string;
      value: IssueComment;
    }
  | { sequence: number; kind: 'event'; createdAt: string; value: IssueEvent }
  | {
      sequence: number;
      kind: 'reference';
      createdAt: string;
      value: WorkItemReferenceEvent;
    };

export interface IssueTimelineWindow {
  items: IssueTimelineItem[];
  context: IssueComment[];
  total: number;
  hidden: number;
  loadBeforeSequence?: number;
  firstBoundarySequence?: number;
}

export interface IssueDetail extends IssueSummary {
  body: string;
  bodyHtml: string;
  authorId: Identifier;
  locked: boolean;
  canEdit: boolean;
  canManage: boolean;
  canConclude: boolean;
  conclusion: IssueConclusion | null;
  participation: { following: boolean; lastReadSequence: number };
  availableAssignees: WorkItemPerson[];
  availableLabels: WorkItemLabel[];
  linkedItems: LinkedWorkItem[];
  timeline: IssueTimelineWindow;
}

export interface IssueConclusion {
  body: string;
  bodyHtml: string;
  commentId: Identifier | null;
  author: string;
  authorDisplayName: string;
  updatedAt: string;
}
