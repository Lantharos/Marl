<script lang="ts">
  import type { MergeMethod, PullRequestDetail } from '@marl/contracts';
  import ChevronDown from 'lucide-svelte/icons/chevron-down';
  import GitMerge from 'lucide-svelte/icons/git-merge';
  import ShieldCheck from 'lucide-svelte/icons/shield-check';
  import { dismissable } from '$lib/actions/dismissable';
  import Button from '$lib/components/Button.svelte';
  import { popoverMotion } from '$lib/ui/popover';

  export type PullLifecycleAction = 'merge' | 'close' | 'reopen' | 'ready';
  let { pull, conflicted = false, busy, approvingChecks = false, mergeMethod = $bindable<MergeMethod>('merge'), onAction, onApproveChecks } = $props<{
    pull: PullRequestDetail;
    conflicted?: boolean;
    busy: boolean;
    approvingChecks?: boolean;
    mergeMethod?: MergeMethod;
    onAction: (action: PullLifecycleAction) => Promise<void>;
    onApproveChecks: () => Promise<void>;
  }>();
  let choosingMethod = $state(false);
  let requirementsOpen = $state(false);
  let confirmingMerge = $state(false);
  const selectedMethod = $derived(pull.allowedMergeMethods.includes(mergeMethod) ? mergeMethod : pull.allowedMergeMethods[0]);
  const mergeLabel = $derived(selectedMethod === 'squash' ? 'Squash and merge' : selectedMethod === 'rebase' ? 'Rebase and merge' : 'Merge pull');
</script>

<div class="actions">
  {#if pull.checksApproval.waiting > 0 && pull.checksApproval.canApprove}
    <Button size="small" variant="primary" disabled={busy} loading={approvingChecks} onclick={onApproveChecks}><ShieldCheck size={14} />Approve checks</Button>
  {/if}
  {#if pull.canMerge && pull.mergeRequirements.ready && !conflicted && selectedMethod}
    <div class="merge" use:dismissable={() => (choosingMethod = false)}>
      <Button variant="primary" size="small" disabled={busy} onclick={() => (confirmingMerge = !confirmingMerge)}><GitMerge size={14} />{mergeLabel}</Button>
      {#if pull.allowedMergeMethods.length > 1}<Button icon size="small" aria-label="Choose merge method" aria-expanded={choosingMethod} onclick={() => (choosingMethod = !choosingMethod)}><ChevronDown size={14} /></Button>{/if}
      {#if choosingMethod}<div class="methods" transition:popoverMotion>{#each pull.allowedMergeMethods as method (method)}<Button variant="ghost" size="small" block onclick={() => { mergeMethod = method; choosingMethod = false; }}>{method === 'squash' ? 'Squash and merge' : method === 'rebase' ? 'Rebase and merge' : 'Merge commit'}</Button>{/each}</div>{/if}
    </div>
  {/if}
  {#if pull.canManage}
    {#if pull.state === 'draft'}<Button size="small" disabled={busy} onclick={() => onAction('ready')}>Ready for review</Button>{/if}
    {#if pull.state === 'closed'}<Button size="small" disabled={busy} onclick={() => onAction('reopen')}>Reopen pull</Button>{:else if pull.state !== 'merged'}<Button size="small" variant="ghost" disabled={busy} onclick={() => onAction('close')}>Close pull</Button>{/if}
  {/if}
  {#if pull.canMerge && !['draft','closed','merged'].includes(pull.state) && (!pull.mergeRequirements.ready || conflicted)}
    <Button size="small" variant="ghost" aria-expanded={requirementsOpen} onclick={() => (requirementsOpen = !requirementsOpen)}>Merge requirements<ChevronDown size={13} /></Button>
    {#if requirementsOpen}<ul class="requirements">{#if conflicted}<li>Resolve the merge conflicts.</li>{/if}{#each pull.mergeRequirements.reasons as reason (reason)}<li>{reason}</li>{/each}</ul>{/if}
  {/if}
  {#if confirmingMerge && pull.mergeRequirements.ready && !conflicted}
    <div class="confirmation"><p>Merge into <code>{pull.targetBranch}</code>?</p><Button size="small" variant="primary" loading={busy} onclick={async () => { if (!selectedMethod) return; mergeMethod = selectedMethod; await onAction('merge'); confirmingMerge = false; }}>Confirm merge</Button><Button size="small" variant="ghost" disabled={busy} onclick={() => (confirmingMerge = false)}>Cancel</Button></div>
  {/if}
</div>

<style>
  .requirements{width:100%;margin:4px 0;padding-left:18px;color:var(--text-muted);font-size:12px;line-height:1.6}.requirements li+li{margin-top:6px}
  .actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.merge{position:relative;display:flex;gap:4px}.methods{position:absolute;top:calc(100% + 6px);left:0;z-index:50;min-width:185px;padding:7px;border-radius:15px;background:var(--surface-raised);box-shadow:var(--shadow-popover);transform-origin:top left}.confirmation{width:100%;padding:12px;border-radius:10px;background:var(--surface-muted)}.confirmation p{margin:0 0 10px;font-size:13px}.confirmation code{overflow-wrap:anywhere}
</style>
