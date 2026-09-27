<script lang="ts">
  import type { PullRequestState } from '@marl/contracts';
  import BadgeCheck from '@lucide/svelte/icons/badge-check';
  import Check from '@lucide/svelte/icons/check';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import ShieldAlert from '@lucide/svelte/icons/shield-alert';
  import { dismissable } from '$lib/actions/dismissable';
  import { popoverMotion } from '$lib/ui/popover';
  import Button from '../../components/controls/Button.svelte';
  import MarkdownComposer from '../../components/markdown/MarkdownComposer.svelte';
  import type { MarkdownContext } from '$lib/markdown/context';

  export type PullComposerAction = 'approve' | 'request_changes';
  type Selection = {
    key: string;
    action: 'comment' | PullComposerAction;
    label: string;
    tone: 'commented' | 'approved' | 'changes_requested';
  };

  let {
    value = $bindable(''),
    pullState,
    locked,
    busy,
    canManage,
    onComment,
    onAction,
    context
  }: {
    value?: string;
    pullState: PullRequestState;
    locked: boolean;
    busy: boolean;
    canManage: boolean;
    onComment: () => Promise<void>;
    onAction: (action: PullComposerAction) => Promise<void>;
    context?: MarkdownContext;
  } = $props();

  const toneVariant = { commented: 'primary', approved: 'success-soft', changes_requested: 'warning-soft' } as const;
  let open = $state(false);
  let uploading = $state(false);
  let selectedKey = $state('comment');
  const active = $derived(['open', 'mergeable', 'blocked'].includes(pullState));
  const selections = $derived.by<Selection[]>(() => {
    const items: Selection[] = [{ key: 'comment', action: 'comment', label: 'Comment', tone: 'commented' }];
    if (active) {
      if (canManage && !locked) {
        items.push(
          { key: 'approve', action: 'approve', label: 'Approve', tone: 'approved' },
          { key: 'request_changes', action: 'request_changes', label: 'Request changes', tone: 'changes_requested' }
        );
      }
    }
    return items;
  });
  const selected = $derived(selections.find((item) => item.key === selectedKey) ?? selections[0]);
  const submitDisabled = $derived(
    busy || uploading || locked || !selected || (selected.action === 'comment' && !value.trim())
  );

  function choose(selection: Selection) {
    selectedKey = selection.key;
    open = false;
  }

  async function submit() {
    if (!selected || submitDisabled) return;
    if (selected.action === 'comment') await onComment();
    else await onAction(selected.action);
    selectedKey = 'comment';
    open = false;
  }
</script>

<div class="min-w-0 pb-1">
  <MarkdownComposer
    bind:value
    bind:uploading
    {context}
    disabled={locked || busy}
    compact
    placeholder={locked ? 'This conversation is locked' : 'Leave a comment'}
    minHeight={84}
    onsubmit={submit}
  />
  <footer class="mt-2.5 flex items-center gap-3">
    {#if locked}<span class="text-sm text-ink-faint">Unlock the conversation to comment.</span>{/if}
    <div class="relative ml-auto flex" use:dismissable={() => (open = false)}>
      <Button
        class={selections.length > 1 ? 'rounded-r-none px-3.5' : 'px-3.5'}
        variant={toneVariant[selected?.tone ?? 'commented']}
        loading={busy}
        disabled={submitDisabled}
        onclick={submit}
      >
        {#if selected?.action === 'approve'}<BadgeCheck
            size={16}
          />{:else if selected?.action === 'request_changes'}<ShieldAlert size={16} />{:else}<MessageSquare
            size={16}
          />{/if}
        {selected?.label ?? 'Comment'}
      </Button>
      {#if selections.length > 1}<Button
          class="rounded-l-none border-l border-current/20"
          icon
          variant={toneVariant[selected?.tone ?? 'commented']}
          aria-label="Choose pull action"
          aria-haspopup="menu"
          aria-expanded={open}
          disabled={busy}
          onclick={() => (open = !open)}><ChevronDown size={16} /></Button
        >{/if}
      {#if open && selections.length > 1}
        <div
          class="absolute right-0 bottom-[calc(100%+8px)] z-45 grid w-[min(240px,calc(100vw-60px))] origin-bottom-right gap-0.5 popover p-1.5"
          role="menu"
          transition:popoverMotion={{ upward: true }}
        >
          {#each selections as selection (selection.key)}
            <button
              type="button"
              class="grid min-h-10 grid-cols-[20px_minmax(0,1fr)_16px] items-center gap-2.5 rounded-lg px-2.5 text-left text-sm text-ink-strong transition-colors hover:bg-surface-hover"
              role="menuitemradio"
              aria-checked={selection.key === selected?.key}
              onclick={() => choose(selection)}
            >
              <span
                class={[
                  'grid place-items-center',
                  selection.tone === 'approved'
                    ? 'text-success'
                    : selection.tone === 'changes_requested'
                      ? 'text-warning'
                      : 'text-ink-muted'
                ]}
                >{#if selection.action === 'approve'}<BadgeCheck
                    size={16}
                  />{:else if selection.action === 'request_changes'}<ShieldAlert size={16} />{:else}<MessageSquare
                    size={16}
                  />{/if}</span
              >
              <span>{selection.label}</span>
              <span class="grid place-items-center text-brand"
                >{#if selection.key === selected?.key}<Check size={15} />{/if}</span
              >
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </footer>
</div>
