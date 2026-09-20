<script lang="ts">
  import { page } from '$app/stores';
  import { untrack } from 'svelte';
  import Minus from 'lucide-svelte/icons/minus';
  import Plus from 'lucide-svelte/icons/plus';
  import X from 'lucide-svelte/icons/x';
  import Check from 'lucide-svelte/icons/check';
  import type { MergeMethod } from '@marl/contracts';
  import { api, MarlApiError } from '$lib/api';
  import Button from '$lib/components/Button.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import Select from '$lib/components/Select.svelte';
  import SettingRow from '$lib/components/settings/SettingRow.svelte';
  import SettingsChoices from '$lib/components/settings/SettingsChoices.svelte';
  import type { BranchRule as Rule } from './+page';

  let { data } = $props<{ data: { rules: Rule[]; defaultBranch: string; branches: Array<{ name: string }> } }>();
  type Field = 'approvals' | 'checks' | 'conversations' | 'carry' | 'author' | 'methods';
  const defaults: Rule = { pattern: '*', requiredApprovals: 0, requiredChecks: [], requireConversations: true, carryApprovalsForward: false, allowAuthorMerge: false, allowedMergeMethods: ['merge', 'squash', 'rebase'] };
  const titles: Record<Field, string> = { approvals: 'Required approvals', checks: 'Required checks', conversations: 'Review conversations', carry: 'Approvals on new revisions', author: 'Who can merge', methods: 'Merge methods' };
  const choices = {
    conversations: [{ value: 'yes', label: 'Resolve before merging', description: 'Every current review conversation must be resolved.' }, { value: 'no', label: 'Allow open conversations', description: 'Maintainers can merge with unresolved feedback.' }],
    carry: [{ value: 'no', label: 'Review each revision', description: 'New commits need fresh approvals.' }, { value: 'yes', label: 'Carry approvals forward', description: 'Keep approvals when new commits arrive. Requested changes stay on their revision.' }],
    author: [{ value: 'no', label: 'Maintainers only', description: 'A maintainer makes the final merge decision.' }, { value: 'yes', label: 'Authors can merge too', description: 'Authors may merge after the required approvals and all checks pass.' }]
  };
  const methods: Array<{ value: MergeMethod; label: string }> = [{ value: 'merge', label: 'Merge commit' }, { value: 'squash', label: 'Squash' }, { value: 'rebase', label: 'Rebase' }];
  let rules = $state<Rule[]>(untrack(() => [...data.rules]));
  let pattern = $state(untrack(() => data.defaultBranch));
  let field = $state<Field | null>(null);
  let draft = $state<Rule>({ ...defaults });
  let decision = $state('no');
  let newCheck = $state('');
  let saving = $state(false);
  let error = $state('');
  const exact = $derived(rules.find(rule => rule.pattern === pattern));
  const inherited = $derived(pattern !== '*' ? rules.find(rule => rule.pattern === '*') : undefined);
  const current = $derived(exact ?? inherited ?? defaults);
  const branchOptions = $derived([{ value: '*', label: 'All branches' }, ...[...new Set([data.defaultBranch, ...data.branches.map((branch: { name: string }) => branch.name), ...rules.map(rule => rule.pattern).filter(value => value !== '*')])].map(value => ({ value, label: value }))]);

  function edit(next: Field) {
    draft = { ...current, pattern, requiredChecks: [...current.requiredChecks], allowedMergeMethods: [...current.allowedMergeMethods] };
    decision = (next === 'conversations' ? current.requireConversations : next === 'carry' ? current.carryApprovalsForward : current.allowAuthorMerge) ? 'yes' : 'no';
    field = next; newCheck = ''; error = '';
  }
  function addCheck() {
    const name = newCheck.trim();
    if (!name || draft.requiredChecks.includes(name) || draft.requiredChecks.length >= 32) return;
    draft.requiredChecks.push(name); newCheck = '';
  }
  function toggleMethod(method: MergeMethod) {
    draft.allowedMergeMethods = draft.allowedMergeMethods.includes(method) ? draft.allowedMergeMethods.filter(value => value !== method) : [...draft.allowedMergeMethods, method];
  }
  async function save() {
    if (saving || !draft.allowedMergeMethods.length) return;
    if (field === 'checks' && newCheck.trim() && !draft.requiredChecks.includes(newCheck.trim()) && draft.requiredChecks.length >= 32) {
      error = 'Keep at most 32 required checks.';
      return;
    }
    if (field === 'checks') addCheck();
    if (field === 'conversations') draft.requireConversations = decision === 'yes';
    if (field === 'carry') draft.carryApprovalsForward = decision === 'yes';
    if (field === 'author') draft.allowAuthorMerge = decision === 'yes';
    saving = true; error = '';
    const submitted = { ...draft, requiredChecks: [...draft.requiredChecks], allowedMergeMethods: [...draft.allowedMergeMethods] };
    try {
      const result = await api<{ branchRule: Rule }>('/repositories/' + $page.params.owner + '/' + $page.params.repo + '/branch-rules', { method: 'PUT', body: JSON.stringify(submitted) });
      rules = [...rules.filter(rule => rule.pattern !== submitted.pattern), result.branchRule];
      field = null;
    } catch (cause) { error = cause instanceof MarlApiError ? cause.message : 'Branch rule could not be saved.'; }
    finally { saving = false; }
  }
</script>

<svelte:head><title>Branches · {$page.params.owner}/{$page.params.repo} · Marl</title></svelte:head>
<header class="page-head"><h2>Branches</h2></header>
<div class="branch-scope"><Select bind:value={pattern} options={branchOptions} ariaLabel="Protected branch" /></div>
{#if !exact && inherited}<p class="inheritance">Using the all-branches rule. Changes create an override for {pattern}.</p>{/if}
<div class="rule-group">
  <SettingRow title="Required approvals" value={current.requiredApprovals === 0 ? 'No approval required' : current.requiredApprovals + (current.requiredApprovals === 1 ? ' approval' : ' approvals')} onclick={() => edit('approvals')} />
  <SettingRow title="Required checks" value={current.requiredChecks.length ? current.requiredChecks.join(' · ') : 'None required'} onclick={() => edit('checks')} />
  <SettingRow title="Review conversations" value={current.requireConversations ? 'Resolve before merging' : 'Open conversations allowed'} onclick={() => edit('conversations')} />
</div>
<div class="rule-group">
  <SettingRow title="Approvals on new revisions" value={current.carryApprovalsForward ? 'Carry approvals forward' : 'Review each revision'} onclick={() => edit('carry')} />
  <SettingRow title="Who can merge" value={current.allowAuthorMerge ? 'Maintainers and eligible authors' : 'Maintainers only'} onclick={() => edit('author')} />
  <SettingRow title="Merge methods" value={methods.filter(method => current.allowedMergeMethods.includes(method.value)).map(method => method.label).join(' · ')} onclick={() => edit('methods')} />
</div>

<Modal open={field !== null} title={field ? titles[field] : ''} onClose={() => { if (!saving) field = null; }} --modal-width="540px">
  {#if field === 'approvals'}
    <div class="approval-count"><Button icon aria-label="Fewer approvals" disabled={saving || draft.requiredApprovals === 0} onclick={() => draft.requiredApprovals--}><Minus size={18} /></Button><output aria-live="polite">{draft.requiredApprovals}</output><Button icon aria-label="More approvals" disabled={saving || draft.requiredApprovals === 10} onclick={() => draft.requiredApprovals++}><Plus size={18} /></Button></div>
    <p class="note">{draft.requiredApprovals === 0 ? 'Pulls can merge without a review.' : 'Approvals required before a pull can merge.'}</p>
    {#if draft.requiredApprovals === 0 && draft.allowAuthorMerge}<p class="note">Authors can merge their own pulls without a review.</p>{/if}
  {:else if field === 'checks'}
    <form class="check-input" onsubmit={(event) => { event.preventDefault(); addCheck(); }}><input aria-label="Check name" bind:value={newCheck} maxlength="240" placeholder="Workflow / Job name" disabled={saving} /><Button type="submit" icon aria-label="Add required check" disabled={saving || !newCheck.trim() || draft.requiredChecks.length >= 32 || draft.requiredChecks.includes(newCheck.trim())}><Plus size={16} /></Button></form>
    <p class="note">Use the exact check name shown on a pull.</p>
    <div class="check-list">{#each draft.requiredChecks as check (check)}<span>{check}<button type="button" aria-label={'Remove ' + check} disabled={saving} onclick={() => (draft.requiredChecks = draft.requiredChecks.filter(value => value !== check))}><X size={13} /></button></span>{/each}</div>
  {:else if field === 'methods'}
    <div class="method-choices" role="group" aria-label="Allowed merge methods">{#each methods as method (method.value)}<button type="button" aria-pressed={draft.allowedMergeMethods.includes(method.value)} disabled={saving} onclick={() => toggleMethod(method.value)}>{#if draft.allowedMergeMethods.includes(method.value)}<Check size={14} />{/if}{method.label}</button>{/each}</div>
    <p class="note">Keep at least one merge method available.</p>
  {:else if field}
    <SettingsChoices bind:value={decision} options={choices[field]} label={titles[field]} disabled={saving} />
    {#if field === 'author' && decision === 'yes' && draft.requiredApprovals === 0}<p class="note">This branch requires no approvals. Authors can merge without a review.</p>{/if}
  {/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#snippet actions()}<Button size="small" disabled={saving} onclick={() => (field = null)}>Cancel</Button><Button size="small" variant="primary" loading={saving} disabled={!draft.allowedMergeMethods.length} onclick={save}>Save</Button>{/snippet}
</Modal>

<style>
  h2{margin:0;color:var(--text-strong)}.branch-scope{width:min(280px,100%);margin-bottom:24px}.rule-group{padding:0 20px;border-radius:14px;background:var(--surface);box-shadow:var(--shadow-surface)}.rule-group+.rule-group{margin-top:18px}.inheritance{margin:-10px 0 22px;color:var(--text-muted);font-size:12px;line-height:1.6}.approval-count{display:flex;align-items:center;justify-content:center;gap:32px;padding:16px 0}output{min-width:2ch;color:var(--text-strong);font-size:42px;font-weight:630;text-align:center;font-variant-numeric:tabular-nums}.note{margin:16px 0 0;color:var(--text-muted);font-size:12px;line-height:1.6}.error{margin:16px 0 0;color:var(--danger);font-size:13px}.check-input{display:flex;align-items:center;gap:8px}.check-input input{min-width:0;flex:1;height:42px;padding:0 12px;border:1px solid var(--border);border-radius:9px;background:var(--surface);color:var(--text-strong);font:inherit;font-size:13px;outline:0}.check-input input:focus{border-color:var(--brand)}.check-list,.method-choices{display:flex;flex-wrap:wrap;gap:8px}.check-list{margin-top:16px}.check-list>span{display:inline-flex;max-width:100%;align-items:center;gap:8px;padding:7px 10px 7px 13px;border-radius:999px;background:var(--surface-muted);color:var(--text);font-size:12px;overflow-wrap:anywhere}.check-list button{display:grid;flex:none;width:24px;height:24px;place-items:center;padding:0;border:0;border-radius:50%;background:transparent;color:var(--text-muted);cursor:pointer}.check-list button:hover{background:var(--surface-hover);color:var(--text-strong)}.method-choices button{display:inline-flex;align-items:center;gap:6px;min-height:38px;padding:8px 14px;border:0;border-radius:999px;background:var(--surface);color:var(--text-muted);font:inherit;font-size:13px;cursor:pointer}.method-choices button[aria-pressed=true]{background:var(--brand-soft);color:var(--brand)}button:focus-visible{outline:2px solid var(--brand);outline-offset:3px}@media(max-width:520px){.rule-group{padding:0 16px}}
</style>
