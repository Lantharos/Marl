import type { ReleaseSummary } from '@marl/contracts';

export type ReleaseState = 'latest' | 'stable' | 'prerelease' | 'draft';

export function releaseState(release: Pick<ReleaseSummary, 'draft' | 'prerelease' | 'latest'>): ReleaseState {
  if (release.draft) return 'draft';
  if (release.prerelease) return 'prerelease';
  return release.latest ? 'latest' : 'stable';
}

export const releaseStateLabels: Record<ReleaseState, string> = {
  latest: 'Latest',
  stable: 'Release',
  prerelease: 'Prerelease',
  draft: 'Draft'
};

export const releaseStateTones: Record<ReleaseState, string> = {
  latest: 'text-brand',
  stable: 'text-ink-muted',
  prerelease: 'text-warning',
  draft: 'text-ink-faint'
};

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

export function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${compact.format(count)} ${count === 1 ? singular : plural}`;
}
