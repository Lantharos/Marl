<script lang="ts">
  import type { RunState, WorkflowSummary, WorkflowTrigger } from '@marl/contracts';
  import { page } from '$app/stores';
  import CircleAlert from 'lucide-svelte/icons/circle-alert';
  import CircleCheck from 'lucide-svelte/icons/circle-check';
  import CircleDot from 'lucide-svelte/icons/circle-dot';
  import FileCode2 from 'lucide-svelte/icons/file-code-2';
  import GitBranch from 'lucide-svelte/icons/git-branch';
  import MousePointerClick from 'lucide-svelte/icons/mouse-pointer-click';
  import Search from 'lucide-svelte/icons/search';
  import Timer from 'lucide-svelte/icons/timer';
  import Zap from 'lucide-svelte/icons/zap';
  import Time from '$lib/components/Time.svelte';
  import type { PageData } from './$types';

  let { data } = $props<{ data: PageData }>();
  const owner = $derived($page.params.owner);
  const repo = $derived($page.params.repo);
  const workflows = $derived(data.workflows as WorkflowSummary[]);
  let query = $state('');
  const filtered = $derived(workflows.filter((workflow) => `${workflow.name} ${workflow.path} ${workflow.triggers.join(' ')}`.toLowerCase().includes(query.trim().toLowerCase())));

  function triggerLabel(trigger: WorkflowTrigger) {
    return trigger === 'workflow_dispatch' ? 'Manual' : trigger === 'pull_request' ? 'Pull request' : trigger[0].toUpperCase() + trigger.slice(1);
  }
</script>

<svelte:head><title>Workflows · {owner}/{repo} · Marl</title></svelte:head>

<header class="heading">
  <div><h1>Workflows</h1><p>Automation defined alongside your code.</p></div>
  <label class="search"><Search size={14} /><input bind:value={query} aria-label="Search workflows" placeholder="Search workflows" /></label>
</header>

<div class="catalog-head"><span>Workflow</span><span>Latest run</span></div>
<section class="catalog">
  {#each filtered as workflow}
    <a class="workflow" href="/{owner}/{repo}/runs/workflows/{workflow.id}">
      <span class="workflow-icon" class:invalid={workflow.status === 'invalid'}><Zap size={17} /></span>
      <span class="identity">
        <strong>{workflow.name}</strong>
        <span class="path"><FileCode2 size={11} />{workflow.path}</span>
        <span class="triggers">
          {#each workflow.triggers as trigger}
            <span>{#if trigger === 'workflow_dispatch'}<MousePointerClick size={11} />{:else if trigger === 'schedule'}<Timer size={11} />{:else}<GitBranch size={11} />{/if}{triggerLabel(trigger)}</span>
          {/each}
        </span>
      </span>
      <span class="latest">
        {#if workflow.lastRun}
          <span class="run-state {workflow.lastRun.state}">{#if ['queued', 'running'].includes(workflow.lastRun.state)}<CircleDot size={14} />{:else if workflow.lastRun.state === 'success'}<CircleCheck size={14} />{:else}<CircleAlert size={14} />{/if}</span>
          <span><strong>{workflow.lastRun.cancellationReason === 'superseded' ? 'Superseded' : workflow.lastRun.state}</strong><small>#{workflow.lastRun.number} · <Time value={workflow.lastRun.queuedAt} /></small></span>
        {:else if workflow.status === 'invalid'}
          <span class="run-state failure"><CircleAlert size={14} /></span><span><strong>Needs attention</strong><small>{workflow.error}</small></span>
        {:else}
          <span class="run-state"><CircleDot size={14} /></span><span><strong>Not run yet</strong><small>{workflow.jobs} {workflow.jobs === 1 ? 'job' : 'jobs'} ready</small></span>
        {/if}
      </span>
    </a>
  {:else}
    <div class="empty"><Zap size={22} /><strong>{query ? 'No matching workflows' : 'No workflows yet'}</strong><p>{query ? 'Try a different name, path, or trigger.' : 'Add a YAML workflow under .marl/workflows or .github/workflows and push it.'}</p></div>
  {/each}
</section>

<style>
  .heading{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin-bottom:27px}.heading h1{margin:0;color:var(--text-strong);font-size:22px;letter-spacing:-.03em}.heading p{margin:6px 0 0;color:var(--text-muted);font-size:11px}.search{display:flex;width:260px;height:30px;align-items:center;gap:7px;padding:0 9px;border:1px solid var(--border);border-radius:5px;background:var(--surface);color:var(--text-faint)}.search input{min-width:0;flex:1;border:0;outline:0;background:transparent;color:var(--text-strong);font-size:10px}.search input::placeholder{color:var(--text-faint)}.catalog-head{display:grid;grid-template-columns:minmax(0,1fr) 250px;padding:0 15px 8px;border-bottom:1px solid var(--border);color:var(--text-faint);font-size:9px}.workflow{display:grid;grid-template-columns:36px minmax(0,1fr) 250px;align-items:center;gap:12px;min-height:87px;padding:10px 15px;border-bottom:1px solid var(--border-subtle);color:inherit;text-decoration:none}.workflow:hover{background:var(--surface-hover)}.workflow-icon{display:grid;width:32px;height:32px;place-items:center;border-radius:8px;background:var(--brand-soft);color:var(--brand)}.workflow-icon.invalid{background:var(--danger-soft);color:var(--danger)}.identity{min-width:0}.identity>strong{display:block;overflow:hidden;color:var(--text-strong);font-size:12px;text-overflow:ellipsis;white-space:nowrap}.path{display:flex;align-items:center;gap:5px;margin-top:4px;color:var(--text-faint);font-family:"SFMono-Regular",Consolas,monospace;font-size:9px}.triggers{display:flex;flex-wrap:wrap;gap:11px;margin-top:7px}.triggers>span{display:inline-flex;align-items:center;gap:4px;color:var(--text-muted);font-size:9px}.latest{display:grid;grid-template-columns:22px minmax(0,1fr);align-items:center;gap:7px;min-width:0}.latest strong,.latest small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.latest strong{color:var(--text-muted);font-size:10px;font-weight:600;text-transform:capitalize}.latest small{margin-top:3px;color:var(--text-faint);font-size:9px}.run-state{display:grid;color:var(--text-faint);place-items:center}.run-state.queued,.run-state.running{color:var(--brand)}.run-state.success{color:var(--success)}.run-state.failure,.run-state.canceled{color:var(--danger)}.empty{display:grid;justify-items:center;padding:72px 20px;color:var(--text-faint);text-align:center}.empty strong{margin-top:12px;color:var(--text-strong);font-size:12px}.empty p{max-width:380px;margin:6px 0 0;font-size:10px;line-height:1.55}@media(max-width:700px){.heading{align-items:flex-start;flex-direction:column}.search{width:100%}.catalog-head{display:none}.workflow{grid-template-columns:32px minmax(0,1fr);padding-inline:5px}.latest{grid-column:2}.workflow-icon{width:28px;height:28px}}
</style>
