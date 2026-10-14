<script lang="ts">
  import GitFork from '@lucide/svelte/icons/git-fork';
  import Lock from '@lucide/svelte/icons/lock';
  import Star from '@lucide/svelte/icons/star';
  import { api } from '#lib/api.js';
  import RepositoryIcon from '#lib/components/identity/RepositoryIcon.svelte';
  import InspectorSection from '../inspector/InspectorSection.svelte';
  import type { CodeRepository } from './code-repository';

  let { repository, signedIn }: { repository: CodeRepository; signedIn: boolean } = $props();
  let starred = $derived(Boolean(repository.starred));
  let starCount = $derived(repository.starCount ?? 0);
  let starring = $state(false);
  const forkCount = $derived(repository.forkCount ?? 0);

  async function toggleStar() {
    starring = true;
    try {
      const result = await api<{ starred: boolean; starCount: number }>(
        `/repositories/${repository.owner}/${repository.name}/star`,
        { method: starred ? 'DELETE' : 'PUT' }
      );
      starred = result.starred;
      starCount = result.starCount;
    } finally {
      starring = false;
    }
  }
</script>

<InspectorSection>
  <div class="flex items-center gap-3">
    <RepositoryIcon name={repository.name} src={repository.iconUrl} size={32} />
    <div class="min-w-0">
      <p class="truncate text-xs text-ink-muted">{repository.owner}</p>
      <h2 class="flex items-center gap-1.5 truncate text-md font-semibold text-ink-strong">
        {repository.name}
        {#if repository.visibility === 'private'}<Lock
            size={13}
            class="shrink-0 text-ink-muted"
            aria-label="Private"
          />{/if}
      </h2>
    </div>
  </div>
  {#if repository.description}<p class="mt-3 text-sm leading-normal text-ink">{repository.description}</p>{/if}
  {#if repository.upstream}<p class="mt-2 flex min-w-0 items-center gap-1.5 text-xs text-ink-muted">
      <GitFork size={12} class="shrink-0" />Forked from
      <a class="truncate hover:text-ink-strong" href="/next/{repository.upstream.owner}/{repository.upstream.name}"
        >{repository.upstream.owner}/{repository.upstream.name}</a
      >
    </p>{/if}
  <div class="mt-3 -ml-2 flex items-center gap-1 text-sm text-ink-muted tabular-nums">
    <button
      type="button"
      class="inline-flex h-7 items-center gap-1.5 rounded-md px-2 transition-colors enabled:hover:bg-surface-hover enabled:hover:text-ink-strong disabled:cursor-default"
      disabled={!signedIn || starring}
      aria-pressed={starred}
      aria-label={starred ? `Unstar, ${starCount} stars` : `Star, ${starCount} stars`}
      onclick={toggleStar}
      ><Star
        size={14}
        fill={starred ? 'currentColor' : 'none'}
        class={starred ? 'text-warning' : ''}
      />{starCount}</button
    >
    <span class="inline-flex h-7 items-center gap-1.5 px-2" aria-label="{forkCount} forks"
      ><GitFork size={14} />{forkCount}</span
    >
  </div>
</InspectorSection>
