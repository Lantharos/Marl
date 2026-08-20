<script lang="ts">
  import type { RunState, WorkflowDetail, WorkflowTrigger } from '@marl/contracts';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { untrack } from 'svelte';
  import CircleAlert from 'lucide-svelte/icons/circle-alert';
  import CircleCheck from 'lucide-svelte/icons/circle-check';
  import CircleDot from 'lucide-svelte/icons/circle-dot';
  import FileCode2 from 'lucide-svelte/icons/file-code-2';
  import GitBranch from 'lucide-svelte/icons/git-branch';
  import MousePointerClick from 'lucide-svelte/icons/mouse-pointer-click';
  import Play from 'lucide-svelte/icons/play';
  import Timer from 'lucide-svelte/icons/timer';
  import Zap from 'lucide-svelte/icons/zap';
  import BackLink from '$lib/components/BackLink.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import Button from '$lib/components/Button.svelte';
  import { api, MarlApiError } from '$lib/api';
  import type { PageData } from './$types';

  let { data } = $props<{ data: PageData }>();
  const owner = $derived($page.params.owner);
  const repo = $derived($page.params.repo);
  let workflow = $state<WorkflowDetail>(untrack(() => data.workflow));
  let dispatchOpen = $state(false);
  let busy = $state(false);
  let error = $state('');
  const manual = $derived(workflow.triggers.includes('workflow_dispatch'));

  function triggerLabel(trigger: WorkflowTrigger) {
    return trigger === 'workflow_dispatch' ? 'Manual dispatch' : trigger === 'pull_request' ? 'Pull request' : trigger[0].toUpperCase() + trigger.slice(1);
  }
  async function dispatch() {
    if (busy) return;
    busy = true; error = '';
    try {
      const result = await api<{ run: { number: number } }>(`/repositories/${owner}/${repo}/workflows/${workflow.id}/dispatch`, { method: 'POST', body: '{}' });
      await goto(`/${owner}/${repo}/runs/${result.run.number}`);
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'The workflow could not be started.';
      busy = false;
    }
  }
</script>

<svelte:head><title>{workflow.name} · {owner}/{repo} · Marl</title></svelte:head>

<header class="workflow-head">
  <div><BackLink href="/{owner}/{repo}/runs" label="Workflows" /><div class="title"><span><Zap size={18} /></span><div><h1>{workflow.name}</h1><p><FileCode2 size={11} />{workflow.path}</p></div></div></div>
  {#if manual}<Button variant="primary" disabled={!workflow.active || workflow.status !== 'valid'} onclick={() => (dispatchOpen = true)}><Play size={13} />Run workflow</Button>{/if}
</header>

<div class="definition">
  <div><strong>Triggers</strong><span class="trigger-list">{#each workflow.triggers as trigger}<span>{#if trigger === 'workflow_dispatch'}<MousePointerClick size={12} />{:else if trigger === 'schedule'}<Timer size={12} />{:else}<GitBranch size={12} />{/if}{triggerLabel(trigger)}</span>{/each}</span></div>
  <div><strong>Definition</strong><code>{workflow.branch}@{workflow.commit.slice(0, 7)}</code></div>
  <div><strong>Jobs</strong><span>{workflow.jobs}</span></div>
</div>

{#if !workflow.active}<div class="invalid"><CircleAlert size={16} /><div><strong>This workflow is no longer active</strong><p>The definition is no longer present on {workflow.branch}. Its run history remains available.</p></div></div>{:else if workflow.status === 'invalid'}<div class="invalid"><CircleAlert size={16} /><div><strong>This workflow cannot run</strong><p>{workflow.error}</p></div></div>{/if}
{#if error}<p class="error" role="alert">{error}</p>{/if}

<section class="history">
  <header><h2>Run history</h2><span>{workflow.runCount} total</span></header>
  {#each workflow.runs as run}
    <a href="/{owner}/{repo}/runs/{run.number}">
      <span class="state {run.state}">{#if ['queued', 'running'].includes(run.state)}<CircleDot size={15} />{:else if run.state === 'success'}<CircleCheck size={15} />{:else}<CircleAlert size={15} />{/if}</span>
      <span class="run-main"><strong>Run #{run.number}</strong><small>{run.trigger === 'workflow_dispatch' ? `Started manually${run.actor ? ` by ${run.actor}` : ''}` : run.trigger === 'retry' ? `Retried${run.actor ? ` by ${run.actor}` : ''}` : `Triggered by ${run.trigger}`}</small></span>
      <span class="ref"><GitBranch size={11} />{run.branch}<code>{run.commit.slice(0, 7)}</code></span>
      <span class="result">{run.cancellationReason === 'superseded' ? 'superseded' : run.state}</span>
    </a>
  {:else}<div class="empty"><strong>No runs yet</strong><p>{manual ? 'Run it manually, or wait for another declared trigger.' : 'The first matching event will appear here.'}</p></div>{/each}
</section>

<Modal open={dispatchOpen} title="Run {workflow.name}?" description="Marl will use the workflow definition at the current indexed head of {workflow.branch}." onClose={() => !busy && (dispatchOpen = false)}>
  {#snippet children()}<div class="dispatch-ref"><GitBranch size={13} /><span>{workflow.branch}</span><code>{workflow.commit.slice(0, 7)}</code></div>{/snippet}
  {#snippet actions()}<Button disabled={busy} onclick={() => (dispatchOpen = false)}>Cancel</Button><Button variant="primary" loading={busy} onclick={dispatch}>Run workflow</Button>{/snippet}
</Modal>

<style>
  .workflow-head{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:22px}.title{display:flex;align-items:center;gap:10px;margin-top:14px}.title>span{display:grid;width:34px;height:34px;place-items:center;border-radius:8px;background:var(--brand-soft);color:var(--brand)}h1{margin:0;color:var(--text-strong);font-size:21px;letter-spacing:-.025em}.title p{display:flex;align-items:center;gap:5px;margin:4px 0 0;color:var(--text-faint);font-family:"SFMono-Regular",Consolas,monospace;font-size:9px}.run,.confirm,.secondary{display:inline-flex;height:31px;align-items:center;justify-content:center;gap:6px;padding:0 10px;border-radius:5px;cursor:pointer;font-size:10px;font-weight:650}.run,.confirm{border:1px solid transparent;background:var(--brand);color:white}.run:disabled{cursor:not-allowed;opacity:.45}.secondary{border:1px solid var(--border);background:var(--surface);color:var(--text)}.definition{display:flex;align-items:center;gap:30px;min-height:53px;padding:0 4px;border-top:1px solid var(--border);border-bottom:1px solid var(--border)}.definition>div{display:flex;align-items:center;gap:9px;color:var(--text-muted);font-size:9px}.definition strong{color:var(--text-faint);font-size:9px;font-weight:550}.definition code{color:var(--text-muted);font-size:9px}.trigger-list{display:flex;gap:10px}.trigger-list>span{display:inline-flex;align-items:center;gap:4px}.invalid{display:flex;align-items:flex-start;gap:9px;margin-top:18px;padding:12px;color:var(--danger);background:var(--danger-soft);border-radius:7px}.invalid strong{font-size:10px}.invalid p{margin:4px 0 0;color:var(--text-muted);font-size:9px}.error{color:var(--danger);font-size:10px}.history{margin-top:28px}.history>header{display:flex;align-items:center;justify-content:space-between;padding-bottom:9px;border-bottom:1px solid var(--border)}.history h2{margin:0;color:var(--text-strong);font-size:13px}.history header span{color:var(--text-faint);font-size:9px}.history>a{display:grid;grid-template-columns:24px minmax(0,1fr) 220px 65px;align-items:center;gap:9px;min-height:61px;padding:7px 4px;border-bottom:1px solid var(--border-subtle);color:inherit;text-decoration:none}.history>a:hover{background:var(--surface-hover)}.state{display:grid;place-items:center;color:var(--text-faint)}.state.queued,.state.running{color:var(--brand)}.state.success{color:var(--success)}.state.failure,.state.canceled{color:var(--danger)}.run-main strong,.run-main small{display:block}.run-main strong{color:var(--text-strong);font-size:10px}.run-main small{margin-top:3px;color:var(--text-faint);font-size:9px}.ref{display:flex;align-items:center;gap:5px;color:var(--text-muted);font-size:9px}.ref code{margin-left:5px;color:var(--text-faint)}.result{color:var(--text-muted);font-size:9px;text-transform:capitalize}.empty{padding:55px 10px;text-align:center}.empty strong{color:var(--text-strong);font-size:11px}.empty p{margin:5px 0 0;color:var(--text-faint);font-size:9px}.dispatch-ref{display:flex;align-items:center;gap:7px;padding:10px;border-radius:6px;background:var(--surface);color:var(--text-muted);font-size:10px}.dispatch-ref code{margin-left:auto;color:var(--text-faint)}@media(max-width:700px){.workflow-head{align-items:flex-start}.definition{align-items:flex-start;flex-direction:column;gap:10px;padding:12px 4px}.history>a{grid-template-columns:22px minmax(0,1fr) 60px}.ref{grid-column:2}.result{grid-column:3;grid-row:1}.trigger-list{flex-wrap:wrap}}
</style>
