<script lang="ts">
  import type { MergeMethod, PullRequestDetail } from '@marl/contracts';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import GitMerge from '@lucide/svelte/icons/git-merge';
  import ShieldCheck from '@lucide/svelte/icons/shield-check';
  import { dismissable } from '$lib/actions/dismissable';
  import Button from '$lib/components/controls/Button.svelte';
  import { popoverMotion } from '$lib/ui/popover';

  export type PullLifecycleAction = 'merge' | 'close' | 'reopen' | 'ready';
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
  let choosingMethod = $state(false);
  let requirementsOpen = $state(false);
  let confirmingMerge = $state(false);
  const selectedMethod = $derived(
    pull.allowedMergeMethods.includes(mergeMethod) ? mergeMethod : pull.allowedMergeMethods[0]
  );
  const mergeLabel = $derived(
    selectedMethod === 'squash' ? 'Squash and merge' : selectedMethod === 'rebase' ? 'Rebase and merge' : 'Merge pull'
  );
</script>

<div class="flex flex-wrap items-center gap-2">
  {#if pull.checksApproval.waiting > 0 && pull.checksApproval.canApprove}
    <Button size="small" variant="primary" disabled={busy} loading={approvingChecks} onclick={onApproveChecks}
      ><ShieldCheck size={15} />Approve checks</Button
    >
  {/if}
  {#if pull.canMerge && pull.mergeRequirements.ready && !conflicted && selectedMethod}
    <div class="relative flex gap-1" use:dismissable={() => (choosingMethod = false)}>
      <Button variant="primary" size="small" disabled={busy} onclick={() => (confirmingMerge = !confirmingMerge)}
        ><GitMerge size={15} />{mergeLabel}</Button
      >
      {#if pull.allowedMergeMethods.length > 1}<Button
          icon
          size="small"
          aria-label="Choose merge method"
          aria-expanded={choosingMethod}
          onclick={() => (choosingMethod = !choosingMethod)}><ChevronDown size={15} /></Button
        >{/if}
      {#if choosingMethod}
        <div
          class="absolute top-[calc(100%+6px)] left-0 z-50 grid min-w-48 origin-top-left gap-0.5 popover p-1.5"
          transition:popoverMotion
        >
          {#each pull.allowedMergeMethods as method (method)}
            <button
              type="button"
              class={[
                'flex h-9 items-center rounded-lg px-2.5 text-left text-sm transition-colors hover:bg-surface-hover',
                method === selectedMethod ? 'font-semibold text-ink-strong' : 'text-ink'
              ]}
              onclick={() => {
                mergeMethod = method;
                choosingMethod = false;
              }}
              >{method === 'squash'
                ? 'Squash and merge'
                : method === 'rebase'
                  ? 'Rebase and merge'
                  : 'Merge commit'}</button
            >
          {/each}
        </div>
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
