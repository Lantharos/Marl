<script lang="ts">
  import { page } from '$app/stores';
  import { untrack } from 'svelte';
  import Check from 'lucide-svelte/icons/check';
  import Save from 'lucide-svelte/icons/save';
  import type { MergeMethod } from '@marl/contracts';
  import { api, MarlApiError } from '$lib/api';
  import Button from '$lib/components/Button.svelte';
  import Checkbox from '$lib/components/Checkbox.svelte';
  import Select from '$lib/components/Select.svelte';
  import type { PageData } from './$types';

  let { data } = $props<{ data: PageData }>();
  type Rule = (typeof data.rules)[number];
  let rules = $state<Rule[]>(untrack(() => [...data.rules]));
  let pattern = $state(untrack(() => data.defaultBranch));
  let approvals = $state('0');
  let requiredChecksInput = $state('');
  let requireConversations = $state(true);
  let dismissStaleReviews = $state(true);
  let allowMerge = $state(true);
  let allowSquash = $state(true);
  let allowRebase = $state(true);
  let saving = $state(false);
  let notice = $state('');
  let error = $state('');
  const branchOptions = $derived([{ value: '*', label: 'All branches' }, ...data.branches.map((branch: { name: string }) => ({ value: branch.name, label: branch.name }))]);

  function chooseRule() {
    const rule = rules.find((item) => item.pattern === pattern);
    approvals = String(rule?.requiredApprovals ?? 0);
    requiredChecksInput = rule?.requiredChecks.join('\n') ?? '';
    requireConversations = rule?.requireConversations ?? true;
    dismissStaleReviews = rule?.dismissStaleReviews ?? true;
    allowMerge = rule?.allowedMergeMethods.includes('merge') ?? true;
    allowSquash = rule?.allowedMergeMethods.includes('squash') ?? true;
    allowRebase = rule?.allowedMergeMethods.includes('rebase') ?? true;
    notice = ''; error = '';
  }

  chooseRule();

  async function save() {
    const allowedMergeMethods: MergeMethod[] = [...(allowMerge ? ['merge' as const] : []), ...(allowSquash ? ['squash' as const] : []), ...(allowRebase ? ['rebase' as const] : [])];
    const requiredChecks = [...new Set(requiredChecksInput.split(/[\n,]/).map((check) => check.trim()).filter(Boolean))];
    if (!allowedMergeMethods.length || saving) return;
    saving = true; notice = ''; error = '';
    try {
      const result = await api<{ branchRule: Rule }>(`/repositories/${$page.params.owner}/${$page.params.repo}/branch-rules`, { method: 'PUT', body: JSON.stringify({ pattern, requiredApprovals: Number(approvals), requiredChecks, requireConversations, dismissStaleReviews, allowedMergeMethods }) });
      rules = [...rules.filter((rule) => rule.pattern !== pattern), result.branchRule];
      notice = 'Branch rule saved.';
    } catch (cause) { error = cause instanceof MarlApiError ? cause.message : 'Branch rule could not be saved.'; }
    finally { saving = false; }
  }
</script>

<svelte:head><title>Branch settings · {$page.params.owner}/{$page.params.repo} · Marl</title></svelte:head>
<header class="page-head"><h2>Branches</h2><p>Set the conditions that must be satisfied before code reaches protected branches.</p></header>
{#if notice}<p class="notice"><Check size={13} />{notice}</p>{/if}
{#if error}<p class="error" role="alert">{error}</p>{/if}
<section>
  <header><h3>Branch rule</h3><p>Exact branch rules override the rule for all branches.</p></header>
  <div class="fields"><label><span>Branch</span><Select bind:value={pattern} options={branchOptions} ariaLabel="Protected branch" onchange={chooseRule} /></label><label><span>Required approvals</span><Select bind:value={approvals} options={[0,1,2,3,4,5].map((value) => ({ value: String(value), label: String(value) }))} ariaLabel="Required approvals" /></label></div>
  <div class="required-checks"><label><span>Required checks</span><textarea bind:value={requiredChecksInput} placeholder="Project checks / Check repository"></textarea><small>One exact workflow/job check name per line. Optional checks never block merging.</small></label></div>
  <div class="requirements"><Checkbox bind:checked={requireConversations} label="Require resolved conversations" description="Every current review thread must be resolved before merge." /><Checkbox bind:checked={dismissStaleReviews} label="Dismiss stale approvals" description="New commits require reviewers to approve the updated head." /></div>
  <div class="methods"><div><strong>Allowed merge methods</strong><p>At least one method must remain available.</p></div><div><Checkbox bind:checked={allowMerge} label="Merge commit" /><Checkbox bind:checked={allowSquash} label="Squash" /><Checkbox bind:checked={allowRebase} label="Rebase" /></div></div>
  <footer><Button variant="primary" disabled={saving || (!allowMerge && !allowSquash && !allowRebase)} onclick={save}><Save size={13} />{saving ? 'Saving…' : 'Save rule'}</Button></footer>
</section>

<style>
  .page-head{margin-bottom:22px}.page-head h2{margin:0;color:var(--text-strong);font-size:24px}.page-head p,section header p,.methods p{margin:6px 0 0;color:var(--text-muted);font-size:12px}.notice,.error{display:flex;align-items:center;gap:7px;margin:0 0 15px;font-size:12px}.notice{color:var(--success)}.error{color:var(--danger)}section{overflow:hidden;border:1px solid var(--border);border-radius:8px;background:var(--surface)}section>header{padding:16px;border-bottom:1px solid var(--border-subtle)}h3{margin:0;color:var(--text-strong);font-size:15px}.fields{display:grid;grid-template-columns:1fr 170px;gap:14px;padding:16px}.fields label>span,.required-checks label>span{display:block;margin-bottom:7px;color:var(--text);font-size:12px;font-weight:620}.required-checks{padding:0 16px 16px}.required-checks textarea{width:100%;min-height:82px;resize:vertical;padding:10px;border:1px solid var(--border-strong);border-radius:6px;outline:0;background:var(--canvas);color:var(--text-strong);font-family:monospace;font-size:12px;line-height:1.5}.required-checks textarea:focus{border-color:var(--brand)}.required-checks small{display:block;margin-top:6px;color:var(--text-muted);font-size:11px}.requirements{display:grid;gap:4px;padding:6px 16px 16px}.methods{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding:16px;border-top:1px solid var(--border-subtle)}.methods strong{color:var(--text-strong);font-size:12px}.methods>div:last-child{display:flex;gap:16px}section footer{display:flex;justify-content:flex-end;padding:12px 16px;border-top:1px solid var(--border-subtle);background:var(--surface-muted)}@media(max-width:580px){.fields{grid-template-columns:1fr}.methods{flex-direction:column}.methods>div:last-child{flex-wrap:wrap}}
</style>
