<script lang="ts">
  import type { RepositoryNotificationLevel } from '@marl/contracts';
  import Bell from '@lucide/svelte/icons/bell';
  import BellOff from '@lucide/svelte/icons/bell-off';
  import Check from '@lucide/svelte/icons/check';
  import { dismissable } from '$lib/actions/dismissable';
  import { api } from '$lib/api';
  import Button from '$lib/components/controls/Button.svelte';
  import { popoverMotion } from '$lib/ui/popover';

  let { owner, repository }: { owner: string; repository: string } = $props();
  let open = $state(false);
  let level = $state<RepositoryNotificationLevel | null>(null);
  const endpoint = $derived(`/repositories/${owner}/${repository}/notifications`);
  const choices: Array<{ value: RepositoryNotificationLevel; label: string; description: string }> = [
    {
      value: 'all',
      label: 'Activity involving you',
      description: 'Mentions, assignments, and conversations you joined.'
    },
    { value: 'mentions', label: 'Mentions only', description: 'Only when someone mentions you.' },
    { value: 'ignore', label: 'Ignore', description: 'Nothing from this repository.' }
  ];

  async function toggle() {
    open = !open;
    if (open && level === null) level = (await api<{ level: RepositoryNotificationLevel }>(endpoint)).level;
  }

  async function choose(next: RepositoryNotificationLevel) {
    const previous = level;
    level = next;
    open = false;
    await api(endpoint, { method: 'PUT', body: JSON.stringify({ level: next }) }).catch(() => (level = previous));
  }
</script>

<div class="relative" use:dismissable={() => (open = false)}>
  <Button icon size="small" aria-label="Repository notifications" aria-expanded={open} onclick={toggle}
    >{#if level === 'ignore'}<BellOff size={15} />{:else}<Bell size={15} />{/if}</Button
  >
  {#if open}
    <div
      class="absolute top-10 right-0 z-30 grid w-[min(300px,calc(100vw-32px))] origin-top-right gap-0.5 popover p-1.5"
      role="menu"
      transition:popoverMotion
    >
      {#each choices as choice (choice.value)}
        <button
          type="button"
          role="menuitemradio"
          aria-checked={level === choice.value}
          disabled={level === null}
          class="grid grid-cols-[minmax(0,1fr)_16px] items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface-hover"
          onclick={() => choose(choice.value)}
        >
          <span class="min-w-0">
            <strong class="block text-sm font-semibold text-ink-strong">{choice.label}</strong>
            <span class="mt-0.5 block text-xs text-ink-muted">{choice.description}</span>
          </span>
          {#if level === choice.value}<Check size={14} class="text-brand" />{/if}
        </button>
      {/each}
    </div>
  {/if}
</div>
