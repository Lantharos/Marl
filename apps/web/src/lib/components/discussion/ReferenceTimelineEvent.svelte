<script lang="ts">
  import { page } from '$app/state';
  import type { WorkItemReferenceEvent } from '@marl/contracts';
  import Time from '../page/Time.svelte';

  let { reference }: { reference: WorkItemReferenceEvent } = $props();
  const source = $derived(reference.source);
  const href = $derived(
    source
      ? `/${encodeURIComponent(source.repository.owner)}/${encodeURIComponent(source.repository.name)}/${source.kind === 'issue' ? 'issues' : 'pulls'}/${source.number}`
      : ''
  );
  const label = $derived.by(() => {
    if (!source) return '';
    const number = `${source.kind === 'issue' ? '#' : '!'}${source.number}`;
    const local = source.repository.owner === page.params.owner && source.repository.name === page.params.repo;
    return local ? number : `${source.repository.owner}/${source.repository.name}${number}`;
  });
</script>

<article class="grid grid-cols-[10px_minmax(0,1fr)] items-start gap-2.5 px-3 py-1.5">
  <span class="mt-2 size-1.5 rounded-full bg-ink-faint" aria-hidden="true"></span>
  <p class="min-w-0 text-sm leading-relaxed text-ink-muted">
    {#if source}Mentioned in <a {href} class="group text-ink hover:text-brand"
        ><span class="font-semibold text-ink-strong group-hover:text-brand">{label}</span>
        {source.title}</a
      >{:else}Mentioned in private work{/if}
    <Time value={reference.createdAt} class="ml-1 text-xs text-ink-faint" />
  </p>
</article>
