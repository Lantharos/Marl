<script lang="ts">
  import type { WorkItemReferenceEvent } from '@marl/contracts';
  import Time from '../page/Time.svelte';

  let { reference }: { reference: WorkItemReferenceEvent } = $props();
  const href = $derived(
    reference.source
      ? `/${encodeURIComponent(reference.source.repository.owner)}/${encodeURIComponent(reference.source.repository.name)}/${reference.source.kind === 'issue' ? 'issues' : 'pulls'}/${reference.source.number}`
      : ''
  );
</script>

<article class="grid grid-cols-[10px_minmax(0,1fr)] items-start gap-2.5 px-3 py-1.5">
  <span class="mt-2 size-1.5 rounded-full bg-brand" aria-hidden="true"></span>
  <p class="min-w-0 text-sm leading-relaxed text-ink-muted">
    {#if reference.source}<a {href} class="font-semibold text-ink-strong hover:underline"
        >{reference.source.repository.owner}/{reference.source.repository.name}{reference.source.kind === 'issue'
          ? '#'
          : '!'}{reference.source.number}</a
      >
      mentioned this in <span class="text-ink">{reference.source.title}</span>{:else}Referenced from private work{/if}
    <Time value={reference.createdAt} class="ml-1 text-xs text-ink-faint" />
  </p>
</article>
