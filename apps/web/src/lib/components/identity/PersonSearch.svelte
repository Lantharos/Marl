<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { WorkItemPerson } from '@marl/contracts';
  import Bot from '@lucide/svelte/icons/bot';
  import Search from '@lucide/svelte/icons/search';
  import { api } from '$lib/api';
  import { popoverMotion } from '$lib/ui/popover';
  import Spinner from '../feedback/Spinner.svelte';
  import UserAvatar from './UserAvatar.svelte';

  let {
    endpoint,
    selected = $bindable(null),
    label = 'Search by name or username'
  }: { endpoint: string; selected?: WorkItemPerson | null; label?: string } = $props();
  const id = $props.id();
  let query = $state('');
  let people = $state<WorkItemPerson[]>([]);
  let active = $state(0);
  let open = $state(false);
  let loading = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let request = 0;

  function search() {
    selected = null;
    open = true;
    active = 0;
    clearTimeout(timer);
    const current = ++request;
    const term = query.trim();
    if (!term) {
      people = [];
      loading = false;
      return;
    }
    loading = true;
    timer = setTimeout(async () => {
      const result = await api<{ people: WorkItemPerson[] }>(`${endpoint}?q=${encodeURIComponent(term)}`).catch(() => ({
        people: []
      }));
      if (current !== request) return;
      people = result.people;
      loading = false;
    }, 150);
  }

  function choose(person: WorkItemPerson) {
    selected = person;
    query = person.displayName;
    open = false;
  }

  function keydown(event: KeyboardEvent) {
    if (!open || !people.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      active = (active + (event.key === 'ArrowDown' ? 1 : -1) + people.length) % people.length;
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(people[active]);
    } else if (event.key === 'Escape') {
      open = false;
    }
  }

  onDestroy(() => clearTimeout(timer));
</script>

<div class="relative">
  <div class="flex field min-h-0 items-center gap-2 text-ink-faint">
    {#if selected}<UserAvatar name={selected.displayName} src={selected.avatarUrl} size={20} />{:else}<Search
        size={15}
        class="shrink-0"
      />{/if}
    <input
      bind:value={query}
      oninput={search}
      onkeydown={keydown}
      onfocus={() => query.trim() && !selected && (open = true)}
      onblur={() => setTimeout(() => (open = false), 120)}
      role="combobox"
      aria-label={label}
      aria-expanded={open}
      aria-controls="{id}-people"
      aria-activedescendant={open && people[active] ? `${id}-person-${active}` : undefined}
      autocomplete="off"
      spellcheck="false"
      data-1p-ignore
      placeholder={label}
      class="h-10 min-w-0 flex-1 bg-transparent text-sm text-ink-strong outline-none placeholder:text-ink-faint"
    />
    {#if loading}<Spinner class="text-ink-faint" />{/if}
  </div>
  {#if open && query.trim() && !loading}
    <div
      id="{id}-people"
      role="listbox"
      aria-label="People"
      class="absolute top-11 left-0 z-40 grid w-full origin-top-left gap-0.5 popover p-1.5"
      transition:popoverMotion
    >
      {#each people as person, index (person.id)}
        <button
          id="{id}-person-{index}"
          type="button"
          role="option"
          aria-selected={index === active}
          class={[
            'grid grid-cols-[24px_minmax(0,1fr)] items-center gap-2.5 rounded-lg px-2.5 py-2 text-left',
            index === active && 'bg-surface-muted'
          ]}
          onmouseenter={() => (active = index)}
          onmousedown={(event) => event.preventDefault()}
          onclick={() => choose(person)}
        >
          <UserAvatar name={person.displayName} src={person.avatarUrl} size={24} />
          <span class="min-w-0">
            <strong class="flex items-center gap-1 truncate text-sm font-semibold text-ink-strong"
              >{person.displayName}{#if person.kind === 'agent'}<Bot
                  size={13}
                  class="shrink-0 text-ink-muted"
                />{/if}</strong
            >
            <span class="block truncate text-xs text-ink-muted"
              >@{person.handle}{person.kind === 'agent' ? ' · agent' : ''}</span
            >
          </span>
        </button>
      {:else}
        <p class="px-2.5 py-3 text-sm text-ink-muted">No one matches “{query.trim()}”.</p>
      {/each}
    </div>
  {/if}
</div>
