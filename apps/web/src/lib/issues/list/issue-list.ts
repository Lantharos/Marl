import type { IssueSummary } from '@marl/contracts';
import { isoTimestamp } from '#lib/time.js';

export type IssueStateFilter = 'open' | 'closed' | 'all';
export type IssueView = 'all' | 'unanswered' | 'following' | 'unread';
export type IssueFilters = { state: IssueStateFilter; view: IssueView; query: string; labels: string[] };
export type IssueGroup = { title: string; issues: IssueSummary[] };

const states: IssueStateFilter[] = ['open', 'closed', 'all'];
const views: IssueView[] = ['all', 'unanswered', 'following', 'unread'];
const day = 86_400_000;

export function readIssueFilters(url: URL): IssueFilters {
  const state = url.searchParams.get('state') as IssueStateFilter;
  const view = url.searchParams.get('view') as IssueView;
  return {
    state: states.includes(state) ? state : 'open',
    view: views.includes(view) ? view : 'all',
    query: url.searchParams.get('q') ?? '',
    labels: url.searchParams.getAll('label')
  };
}

export function issueSearch(filters: IssueFilters) {
  const params = new URLSearchParams();
  if (filters.state !== 'open') params.set('state', filters.state);
  if (filters.view !== 'all') params.set('view', filters.view);
  if (filters.query.trim()) params.set('q', filters.query.trim());
  for (const label of filters.labels) params.append('label', label);
  return params;
}

export function issuePage(filters: IssueFilters, limit: number, cursor?: string) {
  const params = issueSearch(filters);
  params.set('limit', String(limit));
  if (cursor) params.set('cursor', cursor);
  return params;
}

function updatedGroup(value: string, now: Date) {
  const updated = new Date(isoTimestamp(value) ?? value).getTime();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (updated >= midnight) return 'Today';
  if (updated >= midnight - 6 * day) return 'Past week';
  if (updated >= midnight - 29 * day) return 'Past month';
  return 'Older';
}

export function groupByUpdated(issues: IssueSummary[], now = new Date()) {
  const groups: IssueGroup[] = [];
  for (const issue of issues) {
    const title = updatedGroup(issue.updatedAt, now);
    const current = groups.at(-1);
    if (current?.title === title) current.issues.push(issue);
    else groups.push({ title, issues: [issue] });
  }
  return groups;
}

export function emptyIssueCopy(filters: IssueFilters, scope: 'repository' | 'everywhere') {
  const filtered = Boolean(filters.query || filters.labels.length);
  return {
    title:
      filters.view !== 'all'
        ? `No ${filters.view} discussions`
        : filtered
          ? 'No matching issues'
          : `No ${filters.state === 'all' ? '' : `${filters.state} `}issues`,
    description: filtered
      ? 'Try another search or remove a filter.'
      : scope === 'repository'
        ? 'New issues will appear here.'
        : 'Issues from repositories you can access will appear here.'
  };
}
