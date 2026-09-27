import type { Identifier } from './common';
import type { RepositorySummary } from './repositories';

export interface PublicProfileRepository extends RepositorySummary {
  defaultBranch: string;
}

export interface PublicUserProfile {
  profile: {
    handle: string;
    displayName: string;
    avatarUrl: string | null;
    bio: string;
    website: string | null;
    joinedAt: string;
    kind: 'person' | 'agent';
    operator: { slug: string; name: string } | null;
  };
  stats: { repositories: number; contributions: number; pullRequests: number };
  contributions: Array<{ date: string; count: number }>;
  repositories: PublicProfileRepository[];
  organizations: Array<{
    slug: string;
    name: string;
    avatarUrl: string | null;
    description: string;
  }>;
  activity: Array<{
    id: string;
    title: string;
    authoredAt: string;
    owner: string;
    repository: string;
  }>;
}

export interface PublicOrganizationProfile {
  organization: {
    slug: string;
    name: string;
    avatarUrl: string | null;
    description: string;
    website: string | null;
    kind: 'personal' | 'team';
    createdAt: string;
  };
  stats: { repositories: number; members: number; contributions: number };
  repositories: PublicProfileRepository[];
  members: Array<{
    handle: string;
    displayName: string;
    avatarUrl: string | null;
    role: string;
  }>;
  activity: Array<{
    id: string;
    title: string;
    authoredAt: string;
    author: string | null;
    authorAvatarUrl: string | null;
    repository: string;
  }>;
}

export type PublicIdentityProfile = PublicUserProfile | PublicOrganizationProfile;

export interface PublicIndex {
  identities: Array<{ handle: string }>;
  repositories: Array<{ owner: string; name: string; updatedAt: string }>;
}

export interface AccountProfile {
  handle: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  bio: string | null;
  website: string | null;
}

export interface AccountEmail {
  id: Identifier;
  email: string;
  primary: boolean;
  verified: boolean;
  verifiedAt: string | null;
  createdAt: string;
}

export interface AccountSession {
  id: Identifier;
  token: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export interface SshKey {
  id: Identifier;
  name: string;
  fingerprint: string;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface DeveloperToken {
  id: Identifier;
  name: string;
  tokenPrefix: string;
  scopes: string[];
  repositoryIds: string[] | null;
  expiresAt: string;
  lastUsedAt: string | null;
  createdAt: string;
}

export type OrganizationRole = 'owner' | 'admin' | 'member';

export interface OrganizationSummary {
  id: Identifier;
  slug: string;
  name: string;
  avatarUrl: string | null;
  kind: 'personal' | 'team';
  baseRepositoryRole: string | null;
  role: OrganizationRole;
  members: number;
  repositories: number;
}

export interface OrganizationProfile {
  id: Identifier;
  slug: string;
  name: string;
  avatarUrl: string | null;
  description: string;
  website: string | null;
  kind: 'personal' | 'team';
  baseRepositoryRole: string | null;
}

export interface OrganizationMember {
  id: Identifier;
  handle: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  role: OrganizationRole;
  joinedAt: string;
}

export interface OrganizationTeam {
  id: Identifier;
  slug: string;
  name: string;
  description: string;
  members: number;
}

export interface OrganizationTeamMember {
  teamId: Identifier;
  userId: Identifier;
  handle: string;
  displayName: string;
}

export interface OrganizationInvitation {
  id: Identifier;
  email: string;
  role: 'admin' | 'member';
  invitedBy: string;
  expiresAt: string;
  createdAt: string;
}

export interface OrganizationAccess {
  organization: OrganizationProfile;
  viewerRole: OrganizationRole;
  members: OrganizationMember[];
  teams: OrganizationTeam[];
  teamMembers: OrganizationTeamMember[];
  invitations: OrganizationInvitation[];
}

export type IdentityKind = 'person' | 'agent' | 'mannequin';

export interface Agent {
  id: Identifier;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  description: string;
  createdAt: string;
  activeTokens: number;
  lastUsedAt: string | null;
  repositories: number;
}
