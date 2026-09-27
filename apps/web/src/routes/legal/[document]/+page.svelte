<script lang="ts">
  import { legalVersion } from '@marl/contracts';
  import MarkdownBody from '$lib/components/markdown/MarkdownBody.svelte';
  import Page from '$lib/components/page/Page.svelte';
  import Seo from '$lib/components/page/Seo.svelte';
  import { formatDate } from '$lib/time';
  import { legalDocuments } from '$lib/legal/documents';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<Seo title={`${data.document.title} · Marl`} description={data.document.description} path={`/legal/${data.slug}`} />
<Page>
  <div class="grid gap-10 lg:grid-cols-[200px_minmax(0,1fr)]">
    <nav class="grid content-start gap-0.5 max-lg:hidden" aria-label="Policies">
      {#each Object.entries(legalDocuments) as [slug, document] (slug)}
        <a
          href="/legal/{slug}"
          aria-current={slug === data.slug ? 'page' : undefined}
          class={[
            'rounded-lg px-3 py-2 text-sm transition-colors',
            slug === data.slug
              ? 'bg-surface-muted font-semibold text-ink-strong'
              : 'text-ink-muted hover:bg-surface-hover hover:text-ink-strong'
          ]}>{document.title}</a
        >
      {/each}
    </nav>
    <article class="min-w-0">
      <h1 class="text-3xl font-semibold tracking-tight text-ink-strong">{data.document.title}</h1>
      <p class="mt-2 mb-8 text-sm text-ink-muted">Last updated {formatDate(legalVersion)}</p>
      <MarkdownBody html={data.document.html} variant="document" />
    </article>
  </div>
</Page>
