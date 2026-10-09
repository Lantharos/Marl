<script lang="ts">
  import MessageSquareText from '@lucide/svelte/icons/message-square-text';
  import Plus from '@lucide/svelte/icons/plus';
  import { MarlApiError } from '#lib/api.js';
  import { savedReplies } from '#lib/saved-replies/saved-replies.svelte.js';
  import Button from '../controls/Button.svelte';
  import SearchField from '../controls/SearchField.svelte';
  import Spinner from '../feedback/Spinner.svelte';
  import Popover from '../overlays/Popover.svelte';
  import Tooltip from '../overlays/Tooltip.svelte';

  let {
    text,
    disabled = false,
    open = $bindable(false),
    onInsert
  }: { text: string; disabled?: boolean; open?: boolean; onInsert: (body: string) => void } = $props();
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
  });

  $effect(() => search?.focus());

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
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      active = matches.length ? (active + step + matches.length) % matches.length : 0;
    } else if (event.key === 'Enter' && !naming && matches[active]) {
      event.preventDefault();
      choose(matches[active].body);
    }
  }
</script>

<Popover
  bind:open
  class="grid w-85 max-w-[calc(100vw-24px)] gap-1.5 p-1.5 text-ink"
  role="dialog"
  aria-label="Saved replies"
  tabindex={-1}
  onkeydown={keydown}
>
  {#snippet trigger(popover)}
    <Tooltip text="Saved replies (Ctrl .)" as="label">
      {#snippet children(tooltip)}
        <Button icon size="small" variant="ghost" aria-keyshortcuts="Control+." {disabled} {...popover} {...tooltip}
          ><MessageSquareText size={15} /></Button
        >
      {/snippet}
    </Tooltip>
  {/snippet}
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
</Popover>
