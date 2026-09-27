import type { IdentityKind } from './identity';
import type { Identifier } from './common';
import type { RepositorySummary } from './repositories';

export interface WorkItemPerson {
  id: Identifier;
  handle: string;
  displayName: string;
  avatarUrl?: string | null;
  kind?: IdentityKind;
}

export interface WorkItemLabel {
  id: Identifier;
  name: string;
  color: string;
  description: string;
}

export interface LinkedWorkItem {
  id: Identifier;
  kind: 'issue' | 'pull';
  repository: Pick<RepositorySummary, 'owner' | 'name'>;
  number: number;
  title: string;
  state: string;
  closes: boolean;
  direction: 'references' | 'referenced_by';
}

export interface WorkItemReferenceEvent {
  id: Identifier;
  source?: Omit<LinkedWorkItem, 'closes' | 'direction'>;
  createdAt: string;
}
