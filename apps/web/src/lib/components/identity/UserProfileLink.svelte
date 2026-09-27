<script lang="ts">
  import type { IdentityKind } from '@marl/contracts';
  import Bot from '@lucide/svelte/icons/bot';
  import Import from '@lucide/svelte/icons/import';
  import UserAvatar from './UserAvatar.svelte';

  let {
    handle = null,
    displayName,
    avatarUrl = null,
    size = 24,
    avatar = true,
    name = true,
    showHandle = false,
    detail = null,
    kind = 'person',
    class: className = ''
  }: {
    handle?: string | null;
    displayName: string;
    avatarUrl?: string | null;
    size?: number;
    avatar?: boolean;
    name?: boolean;
    showHandle?: boolean;
    detail?: string | null;
    kind?: IdentityKind;
    class?: string;
  } = $props();
  const classes = $derived([
    'group min-w-0 items-center gap-2 text-sm text-ink-strong no-underline',
    name ? 'inline-flex' : 'inline-grid',
    className
  ]);
</script>

{#snippet identity()}
  {#if avatar}<UserAvatar name={displayName} src={avatarUrl} {size} />{/if}
  {#if name}<span class="grid min-w-0 gap-0.5"
      ><span class="flex min-w-0 items-center gap-1"
        ><span class={['truncate font-semibold', handle && 'group-hover:text-brand']}>{displayName}</span
        >{#if kind === 'agent'}<Bot size={13} class="shrink-0 text-ink-muted" aria-label="Agent" /><span class="sr-only"
            >, agent</span
          >{:else if kind === 'mannequin'}<Import
            size={12}
            class="shrink-0 text-ink-muted"
            aria-label="Imported author"
          /><span class="sr-only">, imported author</span>{/if}</span
      >{#if detail}<span class="truncate text-[0.88em] text-ink-muted">{detail}</span
        >{:else if showHandle && handle}<span class="truncate text-[0.88em] text-ink-muted">@{handle}</span>{/if}</span
    >{/if}
{/snippet}

{#if handle && kind !== 'mannequin'}
  <a class={classes} href="/{handle}" aria-label={!name ? displayName : undefined}>{@render identity()}</a>
{:else}
  <span class={classes}>{@render identity()}</span>
{/if}
