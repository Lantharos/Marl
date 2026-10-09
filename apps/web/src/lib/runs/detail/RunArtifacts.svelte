<script lang="ts">
  import type { RunJob } from '@marl/contracts';
  import Archive from '@lucide/svelte/icons/archive';
  import Download from '@lucide/svelte/icons/download';
  import List from '#lib/components/list/List.svelte';
  import ListRow from '#lib/components/list/ListRow.svelte';
  import { formatBytes } from '#lib/bytes.js';

  let { artifacts }: { artifacts: RunJob['artifacts'] } = $props();
</script>

<section aria-labelledby="run-artifacts">
  <h2 id="run-artifacts" class="mb-2 flex items-baseline gap-2 px-1 text-base font-semibold text-ink-strong">
    Artifacts <span class="text-sm font-normal text-ink-muted tabular-nums">{artifacts.length}</span>
  </h2>
  <List class="grid gap-0.5 sm:grid-cols-2">
    {#each artifacts as artifact (artifact.id)}
      <ListRow
        class="group grid grid-cols-[18px_minmax(0,1fr)_auto_16px] items-center gap-2.5 py-2.5"
        href="/api/v1/artifacts/{artifact.id}"
        download={artifact.name}
      >
        <Archive size={15} class="text-ink-muted" />
        <span class="truncate font-mono text-sm text-ink-strong group-hover:text-brand">{artifact.name}</span>
        <span class="text-xs text-ink-muted tabular-nums">{formatBytes(artifact.byteSize)}</span>
        <Download size={14} class="text-ink-faint group-hover:text-brand" />
      </ListRow>
    {/each}
  </List>
</section>
