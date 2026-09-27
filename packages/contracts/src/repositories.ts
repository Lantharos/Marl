import type { Identifier } from './common';

export interface RepositorySummary {
  id: Identifier;
  owner: string;
  name: string;
  description: string;
  iconUrl: string | null;
  visibility: 'public' | 'private';
  updatedAt: string;
  defaultBranch?: string;
  archivedAt?: string;
  deletionScheduledAt?: string;
  language?: string;
  starred?: boolean;
  starCount?: number;
  forkCount?: number;
  upstream?: { owner: string; name: string } | null;
  permissions?: RepositoryPermissions;
}

export interface RepositoryPermissions {
  member: boolean;
  read: boolean;
  triage: boolean;
  push: boolean;
  maintain: boolean;
  admin: boolean;
}

export interface RepositoryTag {
  name: string;
  objectId: string;
  targetCommitId: string;
  annotated: boolean;
}
