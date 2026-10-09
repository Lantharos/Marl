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
  let requirementsOpen = $state(false);
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
</script>

<div class="flex flex-wrap items-center gap-2">
  {#if pull.checksApproval.waiting > 0 && pull.checksApproval.canApprove}
    <Button size="small" variant="primary" disabled={busy} loading={approvingChecks} onclick={onApproveChecks}
      ><ShieldCheck size={15} />Approve checks</Button
    >
  {/if}
  {#if queued}
    <a
      class="inline-flex items-center gap-2 text-sm font-medium text-ink-strong hover:text-brand"
      href="/{pull.repository.owner}/{pull.repository.name}/pulls/queue?branch={encodeURIComponent(pull.targetBranch)}"
      ><ListOrdered size={15} class="text-merged" />{queueStatus}</a
    >
    {#if pull.canMerge && queued.state !== 'merging'}<Button
        size="small"
        variant="ghost"
        disabled={busy}
        onclick={() => onAction('dequeue')}>Remove from queue</Button
      >{/if}
  {:else if pull.canMerge && pull.mergeRequirements.ready && !conflicted && selectedMethod}
    <div class="flex gap-1">
      <Button
        variant="primary"
        size="small"
        disabled={busy}
        onclick={() => {
          if (!pull.mergeQueue.enabled) confirmingMerge = !confirmingMerge;
          else if (selectedMethod) {
            mergeMethod = selectedMethod;
            void onAction('enqueue');
          }
        }}><GitMerge size={15} />{mergeLabel}</Button
      >
      {#if pull.allowedMergeMethods.length > 1}
        <Menu label="Merge method" class="min-w-48">
          {#snippet trigger(menu)}
            <Button icon size="small" aria-label="Choose merge method" {...menu}><ChevronDown size={15} /></Button>
          {/snippet}
          {#each pull.allowedMergeMethods as method (method)}
            <MenuItem checked={method === selectedMethod} onselect={() => (mergeMethod = method)}
              >{methodLabels[method]}</MenuItem
            >
          {/each}
        </Menu>
      {/if}
    </div>
  {/if}
  {#if pull.canManage}
    {#if pull.state === 'draft'}<Button size="small" disabled={busy} onclick={() => onAction('ready')}
        >Ready for review</Button
      >{/if}
    {#if pull.state === 'closed'}<Button size="small" disabled={busy} onclick={() => onAction('reopen')}
        >Reopen pull</Button
      >{:else if pull.state !== 'merged'}<Button
        size="small"
        variant="ghost"
        disabled={busy}
        onclick={() => onAction('close')}>Close pull</Button
      >{/if}
  {/if}
  {#if pull.canMerge && !['draft', 'closed', 'merged'].includes(pull.state) && (!pull.mergeRequirements.ready || conflicted)}
    <Button
      size="small"
      variant="ghost"
      aria-expanded={requirementsOpen}
      onclick={() => (requirementsOpen = !requirementsOpen)}>Merge requirements<ChevronDown size={14} /></Button
    >
    {#if requirementsOpen}<ul class="my-1 w-full list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink-muted">
        {#if conflicted}<li>Resolve the merge conflicts.</li>{/if}
        {#each pull.mergeRequirements.reasons as reason (reason)}<li>{reason}</li>{/each}
      </ul>{/if}
  {/if}
  {#if confirmingMerge && pull.mergeRequirements.ready && !conflicted}
    <div class="w-full rounded-lg bg-surface-muted p-3">
      <p class="mb-2.5 text-sm">
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
</div>
