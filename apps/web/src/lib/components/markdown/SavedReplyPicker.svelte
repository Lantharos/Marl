<script lang="ts">
  import { tick } from 'svelte';
  import MessageSquareText from '@lucide/svelte/icons/message-square-text';
  import Plus from '@lucide/svelte/icons/plus';
  import { dismissable } from '$lib/actions/dismissable';
  import { MarlApiError } from '$lib/api';
  import { savedReplies } from '$lib/saved-replies/saved-replies.svelte';
  import { anchoredPopover, popoverMotion } from '$lib/ui/popover';
  import Button from '../controls/Button.svelte';
  import SearchField from '../controls/SearchField.svelte';
  import Spinner from '../feedback/Spinner.svelte';

  let {
    text,
    disabled = false,
    open = $bindable(false),
    onInsert
  }: { text: string; disabled?: boolean; open?: boolean; onInsert: (body: string) => void } = $props();
  let trigger = $state<HTMLElement>();
  let panel = $state<HTMLElement>();
  let search = $state<HTMLInputElement>();
  let query = $state('');
  let saving = $state(false);
  let naming = $state(false);
  let title = $state('');
  let error = $state('');
  let active = $state(0);
  const matches = $derived(
    savedReplies.replies.filter((reply) =>
      `${reply.title}\n${reply.body}`.toLowerCase().includes(query.trim().toLowerCase())
    )
  );

  $effect(() => {
    if (!open) return;
    query = '';
    naming = false;
    error = '';
    active = 0;
    savedReplies.load().catch(() => (error = 'Saved replies could not be loaded.'));
    void tick().then(() => {
      panel?.showPopover();
      search?.focus();
    });
  });

  function choose(body: string) {
    open = false;
    onInsert(body);
  }

  async function save() {
    if (saving || !title.trim()) return;
    saving = true;
    error = '';
    try {
      await savedReplies.create(title.trim(), text);
      naming = false;
      title = '';
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'The reply could not be saved.';
    } finally {
      saving = false;
    }
  }

  function keydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      open = false;
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      active = matches.length ? (active + step + matches.length) % matches.length : 0;
    } else if (event.key === 'Enter' && !naming && matches[active]) {
      event.preventDefault();
      choose(matches[active].body);
    }
  }
</script>

<span class="relative" use:dismissable={() => (open = false)}>
  <span bind:this={trigger} class="inline-flex">
    <Button
      icon
      size="small"
      variant="ghost"
      aria-label="Saved replies"
      title="Saved replies (Ctrl .)"
      aria-expanded={open}
      {disabled}
      onclick={() => (open = !open)}><MessageSquareText size={15} /></Button
    >
  </span>
  {#if open}
    <div
      bind:this={panel}
      popover="manual"
      class="fixed inset-auto m-0 grid gap-1.5 popover p-1.5 text-ink"
      role="dialog"
      aria-label="Saved replies"
      tabindex="-1"
      onkeydown={keydown}
      {@attach anchoredPopover(trigger, { width: 340 })}
      transition:popoverMotion
    >
      <SearchField bind:value={query} bind:input={search} label="Search saved replies" autocomplete="off" />
      <div class="max-h-64 overflow-auto" role="listbox" aria-label="Saved replies">
        {#if !savedReplies.loaded && !error}
          <p class="flex items-center gap-2 p-2.5 text-sm text-ink-muted"><Spinner />Loading</p>
        {:else}
          {#each matches as reply, index (reply.id)}
            <button
              type="button"
              role="option"
              aria-selected={index === active}
              class={[
                'grid w-full gap-0.5 rounded-lg p-2.5 text-left',
                index === active ? 'bg-surface-muted' : 'hover:bg-surface-hover'
              ]}
              onmouseenter={() => (active = index)}
              onclick={() => choose(reply.body)}
            >
              <span class="truncate text-sm font-medium text-ink-strong">{reply.title}</span>
              <span class="line-clamp-2 text-xs text-ink-muted">{reply.body}</span>
            </button>
          {:else}
            <p class="p-2.5 text-sm text-ink-muted">
              {savedReplies.replies.length ? 'No saved replies match.' : 'No saved replies yet.'}
            </p>
          {/each}
        {/if}
      </div>
      {#if error}<p class="px-2.5 text-xs text-danger" role="alert">{error}</p>{/if}
      <footer class="flex items-center justify-between gap-2 border-t border-line-subtle px-1 pt-1.5">
        {#if naming}
          <form
            class="flex min-w-0 flex-1 gap-1.5"
            onsubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <input
              class="h-8 field min-h-0 min-w-0 flex-1 text-sm"
              bind:value={title}
              maxlength="100"
              placeholder="Title"
              aria-label="Saved reply title"
              data-1p-ignore
            />
            <Button size="small" type="submit" variant="primary" loading={saving} disabled={!title.trim()}>Save</Button>
          </form>
        {:else}
          <Button size="small" variant="ghost" disabled={!text.trim()} onclick={() => (naming = true)}
            ><Plus size={14} />Save this text</Button
          >
          <a class="px-2 text-xs text-ink-muted hover:text-brand" href="/settings/account/replies">Manage</a>
        {/if}
      </footer>
    </div>
  {/if}
</span>
