<script lang="ts">
  import type { MergeMethod, PullRequestDetail } from '@marl/contracts';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import GitMerge from '@lucide/svelte/icons/git-merge';
  import ListOrdered from '@lucide/svelte/icons/list-ordered';
  import ShieldCheck from '@lucide/svelte/icons/shield-check';
  import Button from '#lib/components/controls/Button.svelte';
  import Menu from '#lib/components/overlays/menu/Menu.svelte';
  import MenuItem from '#lib/components/overlays/menu/MenuItem.svelte';

  export type PullLifecycleAction = 'merge' | 'enqueue' | 'dequeue' | 'close' | 'reopen' | 'ready';
  let {
    pull,
    conflicted = false,
    busy,
    approvingChecks = false,
    mergeMethod = $bindable<MergeMethod>('merge'),
    onAction,
    onApproveChecks
  }: {
    pull: PullRequestDetail;
    conflicted?: boolean;
    busy: boolean;
    approvingChecks?: boolean;
    mergeMethod?: MergeMethod;
    onAction: (action: PullLifecycleAction) => Promise<void>;
    onApproveChecks: () => Promise<void>;
  } = $props();
  let confirmingMerge = $state(false);
  const selectedMethod = $derived(
    pull.allowedMergeMethods.includes(mergeMethod) ? mergeMethod : pull.allowedMergeMethods[0]
  );
  const methodLabels: Record<MergeMethod, string> = {
    merge: 'Merge commit',
    squash: 'Squash and merge',
    rebase: 'Rebase and merge'
  };
  const queued = $derived(pull.mergeQueue.entry);
  const mergeable = $derived(pull.canMerge && pull.mergeRequirements.ready && !conflicted && Boolean(selectedMethod));
  const mergeLabel = $derived(
    pull.mergeQueue.enabled
      ? 'Add to merge queue'
      : selectedMethod === 'squash'
        ? 'Squash and merge'
        : selectedMethod === 'rebase'
          ? 'Rebase and merge'
          : 'Merge pull'
  );
  const queueStatus = $derived(
    !queued
      ? ''
      : queued.state === 'queued'
        ? queued.position === 1
          ? 'Next in the merge queue'
          : `${ordinal(queued.position)} in the merge queue`
        : queued.state === 'testing'
          ? `Testing the merge into ${pull.targetBranch}`
          : `Merging into ${pull.targetBranch}`
  );

  function ordinal(value: number) {
    const suffix = value % 100 >= 11 && value % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[value % 10] ?? 'th');
    return `${value}${suffix}`;
  }

  function startMerge() {
    if (!pull.mergeQueue.enabled) {
      confirmingMerge = !confirmingMerge;
      return;
    }
    if (!selectedMethod) return;
    mergeMethod = selectedMethod;
    void onAction('enqueue');
  }
</script>

<div class="grid gap-2 px-1 pt-1 pb-0.5 empty:hidden">
  {#if pull.checksApproval.waiting > 0 && pull.checksApproval.canApprove}
    <Button variant="primary" class="w-full" disabled={busy} loading={approvingChecks} onclick={onApproveChecks}
      ><ShieldCheck size={15} />Approve checks</Button
    >
  {/if}
  {#if queued}
    <div class="flex min-h-9 flex-wrap items-center justify-between gap-2 rounded-lg bg-merged-soft px-3 py-1">
      <a
        class="inline-flex items-center gap-2 text-sm font-medium text-ink-strong hover:text-brand"
        href="/{pull.repository.owner}/{pull.repository.name}/pulls/queue?branch={encodeURIComponent(
          pull.targetBranch
        )}"><ListOrdered size={15} class="text-merged" />{queueStatus}</a
      >
      {#if pull.canMerge && queued.state !== 'merging'}<Button
          size="small"
          variant="ghost"
          disabled={busy}
          onclick={() => onAction('dequeue')}>Remove</Button
        >{/if}
    </div>
  {:else if mergeable}
    <div class="flex gap-1">
      <Button
        variant="primary"
        class="flex-1"
        disabled={busy}
        aria-expanded={pull.mergeQueue.enabled ? undefined : confirmingMerge}
        onclick={startMerge}><GitMerge size={15} />{mergeLabel}</Button
      >
      {#if pull.allowedMergeMethods.length > 1}
        <Menu label="Merge method" class="min-w-48">
          {#snippet trigger(menu)}
            <Button icon aria-label="Choose merge method" {...menu}><ChevronDown size={15} /></Button>
          {/snippet}
          {#each pull.allowedMergeMethods as method (method)}
            <MenuItem checked={method === selectedMethod} onselect={() => (mergeMethod = method)}
              >{methodLabels[method]}</MenuItem
            >
          {/each}
        </Menu>
      {/if}
    </div>
    {#if confirmingMerge}
      <div class="rounded-lg bg-surface p-3 shadow-surface">
        <p class="mb-2.5 text-sm text-ink">
          Merge into <code class="font-mono break-all text-ink-strong">{pull.targetBranch}</code>?
        </p>
        <div class="flex gap-2">
          <Button
            size="small"
            variant="primary"
            loading={busy}
            onclick={async () => {
              if (!selectedMethod) return;
              mergeMethod = selectedMethod;
              await onAction('merge');
              confirmingMerge = false;
            }}>Confirm merge</Button
          >
          <Button size="small" variant="ghost" disabled={busy} onclick={() => (confirmingMerge = false)}>Cancel</Button>
        </div>
      </div>
    {/if}
  {/if}
  {#if pull.canManage && pull.state !== 'merged'}
    <div class="flex flex-wrap items-center gap-1">
      {#if pull.state === 'draft'}<Button size="small" disabled={busy} onclick={() => onAction('ready')}
          >Ready for review</Button
        >{/if}
      {#if pull.state === 'closed'}<Button size="small" disabled={busy} onclick={() => onAction('reopen')}
          >Reopen pull</Button
        >{:else}<Button size="small" variant="ghost" class="ml-auto" disabled={busy} onclick={() => onAction('close')}
          >Close pull</Button
        >{/if}
    </div>
  {/if}
</div>
