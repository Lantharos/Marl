<script lang="ts">
  import type { RepositorySummary } from '@marl/contracts';
  import Check from '@lucide/svelte/icons/check';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import SearchField from '#lib/components/controls/SearchField.svelte';
  import RepositoryIcon from '#lib/components/identity/RepositoryIcon.svelte';
  import Popover from '#lib/components/overlays/Popover.svelte';

  let {
    value = $bindable(),
    repositories
  }: {
    value: string;
    repositories: RepositorySummary[];
  } = $props();
  let open = $state(false);
  let query = $state('');
  let input = $state<HTMLInputElement>();
  const fullName = (repository: RepositorySummary) => `${repository.owner}/${repository.name}`;
  const selected = $derived(repositories.find((repository) => fullName(repository) === value));
  const matches = $derived(
    repositories.filter((repository) =>
      `${fullName(repository)} ${repository.description}`.toLowerCase().includes(query.trim().toLowerCase())
    )
  );

  $effect(() => {
    input?.focus();
  });

  function choose(repository: RepositorySummary) {
    value = fullName(repository);
    open = false;
  }
</script>

<Popover
  bind:open
  placement="bottom-start"
  class="flex max-h-96 w-80 max-w-[calc(100vw-24px)] flex-col p-1.5"
  role="dialog"
  aria-label="Choose a repository"
>
  {#snippet trigger(popover)}
    <button
      type="button"
      class="inline-flex h-9 max-w-full items-center gap-2 rounded-full bg-surface-muted pr-3 pl-1.5 text-sm font-semibold text-ink-strong transition-colors hover:bg-surface-hover"
      aria-label={`Repository: ${value}`}
      onclick={() => (query = '')}
      {...popover}
      ><RepositoryIcon name={selected?.name ?? value} src={selected?.iconUrl} size={24} /><span class="truncate"
        >{value}</span
      ><ChevronDown size={14} class="shrink-0 text-ink-muted" /></button
    >
  {/snippet}
  <SearchField
    bind:value={query}
    bind:input
    label="Find a repository"
    class="shrink-0 border-transparent bg-surface"
    onkeydown={(event) => event.key === 'Enter' && matches[0] && choose(matches[0])}
  />
  <div class="mt-1.5 grid min-h-0 gap-0.5 overflow-y-auto">
    {#each matches as repository (repository.id)}
      <button
        type="button"
        class="flex min-h-11 w-full items-center gap-2.5 rounded-lg p-2 text-left transition-colors hover:bg-surface-hover aria-pressed:bg-surface-muted"
        aria-pressed={fullName(repository) === value}
        onclick={() => choose(repository)}
      >
        <RepositoryIcon name={repository.name} src={repository.iconUrl} size={26} />
        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm font-semibold text-ink-strong">{fullName(repository)}</span>
          {#if repository.description}<span class="mt-0.5 block truncate text-xs text-ink-muted"
              >{repository.description}</span
            >{/if}
        </span>
        {#if fullName(repository) === value}<Check size={15} class="shrink-0 text-brand" />{/if}
      </button>
    {:else}
      <p class="px-2 py-5 text-center text-sm text-ink-muted">No matching repositories</p>
    {/each}
  </div>
</Popover>
