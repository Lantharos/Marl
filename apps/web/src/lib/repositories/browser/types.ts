export type BranchSummary = { name: string; commitId: string; title: string; updatedAt: string };

export type TreeEntry = {
  path: string;
  name: string;
  kind: 'blob' | 'tree';
  byteSize?: number | null;
  commitId?: string;
  message?: string;
  author?: string;
  updatedAt?: string;
};

export type LatestCommit = {
  id: string;
  shortId: string;
  title: string;
  author: string;
  authorHandle?: string | null;
  authorDisplayName?: string | null;
  authorAvatarUrl?: string | null;
  signatureStatus: string;
};

export type CommitSummary = LatestCommit & { authoredAt: string };

export type Tree = { revision: string; commit: LatestCommit; entries: TreeEntry[] };

export type Folders = Record<string, Tree>;

export type RenderedDocument = { html: string; truncated: boolean };
