<script lang="ts">
  import { page } from '$app/stores';
  import { untrack } from 'svelte';
  import Check from 'lucide-svelte/icons/check';
  import Save from 'lucide-svelte/icons/save';
  import type { MergeMethod } from '@sty/contracts';
  import { api, StyApiError } from '$lib/api';
  import Checkbox from '$lib/components/Checkbox.svelte';
  import Select from '$lib/components/Select.svelte';
  import type { PageData } from './$types';

  let { data } = $props<{ data: PageData }>();
  type Rule = (typeof data.rules)[number];
  let rules = $state<Rule[]>(untrack(() => [...data.rules]));
  let pattern = $state(untrack(() => data.defaultBranch));
  let approvals = $state('0');
  let requireChecks = $state(false);
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
    requireChecks = rule?.requireChecks ?? false;
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
    if (!allowedMergeMethods.length || saving) return;
    saving = true; notice = ''; error = '';
    try {
      const result = await api<{ branchRule: Rule }>(`/repositories/${$page.params.owner}/${$page.params.repo}/branch-rules`, { method: 'PUT', body: JSON.stringify({ pattern, requiredApprovals: Number(approvals), requireChecks, requireConversations, dismissStaleReviews, allowedMergeMethods }) });
      rules = [...rules.filter((rule) => rule.pattern !== pattern), result.branchRule];
      notice = 'Branch rule saved.';
    } catch (cause) { error = cause instanceof StyApiError ? cause.message : 'Branch rule could not be saved.'; }
    finally { saving = false; }
  }
</script>

<svelte:head><title>Branch settings · {$page.params.owner}/{$page.params.repo} · Sty</title></svelte:head>
<header class="page-head"><h2>Branches</h2><p>Set the conditions that must be satisfied before code reaches protected branches.</p></header>
{#if notice}<p class="notice"><Check size={13} />{notice}</p>{/if}
{#if error}<p class="error" role="alert">{error}</p>{/if}
<section>
  <header><h3>Branch rule</h3><p>Exact branch rules override the rule for all branches.</p></header>
  <div class="fields"><label><span>Branch</span><Select bind:value={pattern} options={branchOptions} ariaLabel="Protected branch" onchange={chooseRule} /></label><label><span>Required approvals</span><Select bind:value={approvals} options={[0,1,2,3,4,5].map((value) => ({ value: String(value), label: String(value) }))} ariaLabel="Required approvals" /></label></div>
  <div class="requirements"><Checkbox bind:checked={requireChecks} label="Require successful checks" description="At least one check must report and every reported check must pass." /><Checkbox bind:checked={requireConversations} label="Require resolved conversations" description="Every current review thread must be resolved before merge." /><Checkbox bind:checked={dismissStaleReviews} label="Dismiss stale approvals" description="New commits require reviewers to approve the updated head." /></div>
  <div class="methods"><div><strong>Allowed merge methods</strong><p>At least one method must remain available.</p></div><div><Checkbox bind:checked={allowMerge} label="Merge commit" /><Checkbox bind:checked={allowSquash} label="Squash" /><Checkbox bind:checked={allowRebase} label="Rebase" /></div></div>
  <footer><button disabled={saving || (!allowMerge && !allowSquash && !allowRebase)} onclick={save}><Save size={13} />{saving ? 'Saving…' : 'Save rule'}</button></footer>
</section>

<style>
  .page-head{margin-bottom:20px}.page-head h2{margin:0;color:var(--text-strong);font-size:20px}.page-head p,section header p,.methods p{margin:5px 0 0;color:var(--text-faint);font-size:10px}.notice,.error{display:flex;align-items:center;gap:6px;margin:0 0 14px;font-size:10px}.notice{color:var(--success)}.error{color:var(--danger)}section{overflow:hidden;border:1px solid var(--border);border-radius:8px;background:var(--surface)}section>header{padding:14px;border-bottom:1px solid var(--border-subtle)}h3{margin:0;color:var(--text-strong);font-size:13px}.fields{display:grid;grid-template-columns:1fr 150px;gap:12px;padding:14px}.fields label>span{display:block;margin-bottom:6px;color:var(--text-muted);font-size:9px;font-weight:620}.requirements{display:grid;gap:3px;padding:5px 14px 14px}.methods{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding:14px;border-top:1px solid var(--border-subtle)}.methods strong{color:var(--text-strong);font-size:10px}.methods>div:last-child{display:flex;gap:14px}section footer{display:flex;justify-content:flex-end;padding:11px 14px;border-top:1px solid var(--border-subtle);background:var(--surface-muted)}section footer button{display:flex;height:31px;align-items:center;gap:6px;padding:0 10px;border:0;border-radius:6px;background:var(--brand);color:white;cursor:pointer;font-size:9px;font-weight:650}section footer button:disabled{cursor:not-allowed;opacity:.45}@media(max-width:580px){.fields{grid-template-columns:1fr}.methods{flex-direction:column}.methods>div:last-child{flex-wrap:wrap}}
</style>
