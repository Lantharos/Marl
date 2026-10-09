<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import type { IssueSummary } from '@marl/contracts';
  import InfiniteScroll from '#lib/components/feedback/InfiniteScroll.svelte';
  import PageHeader from '#lib/components/page/PageHeader.svelte';
  import Seo from '#lib/components/page/Seo.svelte';
  import IssueList from '#lib/issues/list/IssueList.svelte';
  import IssueToolbar from '#lib/issues/list/IssueToolbar.svelte';
  import { emptyIssueCopy, issuePage, issueSearch, type IssueFilters } from '#lib/issues/list/issue-list.js';
  import { CursorList } from '#lib/ui/cursor-list.svelte.js';
  import { api } from '#lib/api.js';
  import type { PageProps } from './$types';

  let { data, params }: PageProps = $props();
  const base = $derived(`/${params.owner}/${params.repo}`);
  const empty = $derived(emptyIssueCopy(data.filters, 'repository'));
  const issues = new CursorList(
    () => ({ items: data.issues, nextCursor: data.nextCursor }),
    async (cursor) => {
      const result = await api<{ issues: IssueSummary[]; nextCursor: string | null }>(
        `/repositories/${data.repository.owner}/${data.repository.name}/issues?${issuePage(data.filters, 30, cursor)}`
      );
      return { items: result.issues, nextCursor: result.nextCursor };
    },
    'More issues could not be loaded.'
  );

  function filter(filters: IssueFilters) {
    const search = issueSearch(filters);
    void goto(`${base}/issues${search.size ? `?${search}` : ''}`, { reset: false, replace: true });
  }
</script>

<Seo
  title={`Issues · ${params.owner}/${params.repo} · Marl`}
  description={`Track bugs, ideas, and project work for ${params.owner}/${params.repo} on Marl.`}
  path={page.url.pathname}
  robots={data.repository.visibility === 'public' ? 'index, follow' : 'noindex, nofollow'}
/>
<PageHeader
  title="Issues"
  actionHref={data.shellUser ? `/issues/new?repository=${params.owner}/${params.repo}` : undefined}
  actionLabel={data.shellUser ? 'New issue' : undefined}
/>
<IssueToolbar
  filters={data.filters}
  counts={data.counts}
  labelOptions={data.availableLabels}
  personal={Boolean(data.shellUser)}
  onChange={filter}
/>
<IssueList issues={issues.items} emptyTitle={empty.title} emptyDescription={empty.description} />
<InfiniteScroll list={issues} />
