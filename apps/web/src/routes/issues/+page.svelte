<script lang="ts">
  import { goto } from '$app/navigation';
  import type { IssueSummary } from '@marl/contracts';
  import InfiniteScroll from '#lib/components/feedback/InfiniteScroll.svelte';
  import Page from '#lib/components/page/Page.svelte';
  import PageHeader from '#lib/components/page/PageHeader.svelte';
  import IssueList from '#lib/issues/list/IssueList.svelte';
  import IssueToolbar from '#lib/issues/list/IssueToolbar.svelte';
  import { emptyIssueCopy, issuePage, issueSearch, type IssueFilters } from '#lib/issues/list/issue-list.js';
  import { CursorList } from '#lib/ui/cursor-list.svelte.js';
  import { api } from '#lib/api.js';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
  const empty = $derived(emptyIssueCopy(data.filters, 'everywhere'));
  const issues = new CursorList(
    () => ({ items: data.issues, nextCursor: data.nextCursor }),
    async (cursor) => {
      const result = await api<{ issues: IssueSummary[]; nextCursor: string | null }>(
        `/issues?${issuePage(data.filters, 40, cursor)}`
      );
      return { items: result.issues, nextCursor: result.nextCursor };
    },
    'More issues could not be loaded.'
  );

  function filter(filters: IssueFilters) {
    const search = issueSearch(filters);
    void goto(`/issues${search.size ? `?${search}` : ''}`, { reset: false, replace: true });
  }
</script>

<svelte:head><title>Issues · Marl</title></svelte:head>
<Page>
  <PageHeader title="Issues" actionHref="/issues/new" actionLabel="New issue" />
  <IssueToolbar filters={data.filters} personal onChange={filter} />
  <IssueList issues={issues.items} showRepository emptyTitle={empty.title} emptyDescription={empty.description} />
  <InfiniteScroll list={issues} />
</Page>
