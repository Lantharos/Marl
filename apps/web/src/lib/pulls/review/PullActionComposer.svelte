<script lang="ts">
  import type { PullRequestState } from '@marl/contracts';
  import BadgeCheck from '@lucide/svelte/icons/badge-check';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import ShieldAlert from '@lucide/svelte/icons/shield-alert';
  import Button from '../../components/controls/Button.svelte';
  import MarkdownComposer from '../../components/markdown/MarkdownComposer.svelte';
  import Menu from '../../components/overlays/menu/Menu.svelte';
  import MenuItem from '../../components/overlays/menu/MenuItem.svelte';
  import type { MarkdownContext } from '#lib/markdown/context.js';

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
  const iconTones = {
    commented: 'text-ink-muted',
    approved: 'text-success',
    changes_requested: 'text-warning'
  } as const;
  const icons = { comment: MessageSquare, approve: BadgeCheck, request_changes: ShieldAlert } as const;
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

  async function submit() {
    if (!selected || submitDisabled) return;
    if (selected.action === 'comment') await onComment();
    else await onAction(selected.action);
    selectedKey = 'comment';
  }
</script>

<div class="min-w-0 pb-1" data-pull-composer>
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
    <div class="ml-auto flex">
      <Button
        class={selections.length > 1 ? 'rounded-r-none px-3.5' : 'px-3.5'}
        variant={toneVariant[selected?.tone ?? 'commented']}
        loading={busy}
        disabled={submitDisabled}
        onclick={submit}
      >
        {#if selected}{@const Icon = icons[selected.action]}<Icon size={16} />{/if}
        {selected?.label ?? 'Comment'}
      </Button>
      {#if selections.length > 1}
        <Menu label="Pull action" placement="top-end" class="w-[min(240px,calc(100vw-60px))]">
          {#snippet trigger(menu)}
            <Button
              class="rounded-l-none border-l border-current/20"
              icon
              variant={toneVariant[selected?.tone ?? 'commented']}
              aria-label="Choose pull action"
              disabled={busy}
              {...menu}><ChevronDown size={16} /></Button
            >
          {/snippet}
          {#each selections as selection (selection.key)}
            <MenuItem
              icon={icons[selection.action]}
              iconClass={iconTones[selection.tone]}
              checked={selection.key === selected?.key}
              onselect={() => (selectedKey = selection.key)}>{selection.label}</MenuItem
            >
          {/each}
        </Menu>
      {/if}
    </div>
  </footer>
</div>
