export type TreeEntry = { path: string; name: string; kind: 'blob' | 'tree'; message?: string; updatedAt?: string };

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
