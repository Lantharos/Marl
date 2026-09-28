import type { Identifier } from '../common';
import type { RepositorySummary } from './repositories';

export interface ReleaseAsset {
  id: Identifier;
  name: string;
  byteSize: number;
  contentType: string;
  downloadCount: number;
  createdAt: string;
  downloadUrl: string;
  canDelete: boolean;
}

export interface ReleaseSummary {
  id: Identifier;
  repository: Pick<RepositorySummary, 'owner' | 'name'>;
  tagName: string;
  targetCommitId: string;
  targetBranch: string | null;
  name: string;
  body: string;
  bodyText: string;
  author: string;
  authorDisplayName: string;
  authorAvatarUrl: string | null;
  draft: boolean;
  prerelease: boolean;
  latest: boolean;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  assetCount: number;
}

export interface ReleaseDetail extends ReleaseSummary {
  bodyHtml: string;
  assets: ReleaseAsset[];
  canEdit: boolean;
}
