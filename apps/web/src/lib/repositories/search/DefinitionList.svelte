<script lang="ts">
  import type { CodeDefinition } from '@marl/contracts';
  import Braces from '@lucide/svelte/icons/braces';
  import { encodeRepositoryPath, encodeRevision } from '$lib/repositories/repository-path';

  let {
    definitions,
    owner,
    repository,
    revision
  }: { definitions: CodeDefinition[]; owner: string; repository: string; revision: string } = $props();
</script>

<section class="mb-5" aria-labelledby="definitions-heading">
  <h2 id="definitions-heading" class="mb-2 text-sm font-semibold text-ink-strong">
    {definitions.length === 1 ? 'Definition' : 'Definitions'}
  </h2>
  <ul class="divide-y divide-line-subtle overflow-hidden surface">
    {#each definitions as definition (`${definition.path}:${definition.line}`)}
      <li>
        <a
          class="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-hover"
          href="/{owner}/{repository}/blob/{encodeRevision(revision)}/{encodeRepositoryPath(
            definition.path
          )}#L{definition.line}"
        >
          <Braces size={15} class="shrink-0 text-brand" />
          <span class="font-mono text-sm font-semibold text-ink-strong">{definition.name}</span>
          <span class="text-xs text-ink-muted">{definition.kind}</span>
          <span class="ml-auto min-w-0 truncate font-mono text-xs text-ink-muted"
            >{definition.path}:{definition.line}</span
          >
        </a>
      </li>
    {/each}
  </ul>
</section>
