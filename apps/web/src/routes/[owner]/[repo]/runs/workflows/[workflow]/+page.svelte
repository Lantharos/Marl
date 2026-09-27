<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import CirclePlay from '@lucide/svelte/icons/circle-play';
  import FileCode2 from '@lucide/svelte/icons/file-code-corner';
  import GitBranch from '@lucide/svelte/icons/git-branch';
  import Play from '@lucide/svelte/icons/play';
  import Zap from '@lucide/svelte/icons/zap';
  import { api, MarlApiError } from '$lib/api';
  import Button from '$lib/components/controls/Button.svelte';
  import EmptyState from '$lib/components/feedback/EmptyState.svelte';
  import Notice from '$lib/components/feedback/Notice.svelte';
  import Modal from '$lib/components/overlays/Modal.svelte';
  import BackLink from '$lib/components/page/BackLink.svelte';
  import RunRow from '$lib/runs/RunRow.svelte';
  import { workflowTrigger } from '$lib/runs/workflow-triggers';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const owner = $derived(page.params.owner);
  const repo = $derived(page.params.repo);
  const workflow = $derived(data.workflow);
  const manual = $derived(workflow.triggers.includes('workflow_dispatch'));
  const runnable = $derived(workflow.active && workflow.status === 'valid');
  let dispatchOpen = $state(false);
  let busy = $state(false);
  let error = $state('');

  async function dispatch() {
    if (busy) return;
    busy = true;
    error = '';
    try {
      const result = await api<{ run: { number: number } }>(
        `/repositories/${owner}/${repo}/workflows/${workflow.id}/dispatch`,
        {
          method: 'POST',
          body: '{}'
        }
      );
      dispatchOpen = false;
      await goto(`/${owner}/${repo}/runs/${result.run.number}`);
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'The workflow could not be started.';
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>{workflow.name} · {owner}/{repo} · Marl</title></svelte:head>

<BackLink href="/{owner}/{repo}/runs" label="Workflows" />
<header class="mt-5 mb-6 flex flex-wrap items-start justify-between gap-5">
  <div class="flex min-w-0 gap-3.5">
    <span class="grid size-10.5 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand"><Zap size={19} /></span
    >
    <div class="min-w-0">
      <h1 class="text-2xl font-semibold tracking-tight wrap-anywhere text-ink-strong">{workflow.name}</h1>
      <p class="mt-1 flex items-center gap-1 font-mono text-xs text-ink-muted">
        <FileCode2 size={12} />{workflow.path}
      </p>
    </div>
  </div>
  {#if manual && data.repository.permissions.push}<Button
      variant="primary"
      disabled={!runnable}
      onclick={() => (dispatchOpen = true)}><Play size={14} />Run workflow</Button
    >{/if}
</header>

<dl class="mb-6 flex flex-wrap gap-x-8 gap-y-3 text-sm">
  <div>
    <dt class="text-xs text-ink-muted">Triggers</dt>
    <dd class="mt-1 flex flex-wrap gap-1.5">
      {#each workflow.triggers as trigger (trigger)}
        {@const { label, icon: Icon } = workflowTrigger(trigger)}
        <span
          class="inline-flex items-center gap-1 rounded-md bg-surface-muted px-2 py-0.5 text-xs font-medium text-ink"
          ><Icon size={12} />{label}</span
        >
      {/each}
    </dd>
  </div>
  <div>
    <dt class="text-xs text-ink-muted">Definition</dt>
    <dd class="mt-1 font-mono text-xs text-ink">{workflow.branch}@{workflow.commit.slice(0, 7)}</dd>
  </div>
  <div>
    <dt class="text-xs text-ink-muted">Jobs</dt>
    <dd class="mt-1 text-ink tabular-nums">{workflow.jobs}</dd>
  </div>
</dl>

{#if !workflow.active}
  <Notice tone="warning" class="mb-6"
    ><strong class="font-semibold">This workflow is no longer active.</strong> The definition is no longer present on {workflow.branch}.
    Its run history remains available.</Notice
  >
{:else if workflow.status === 'invalid'}
  <Notice class="mb-6"><strong class="font-semibold">This workflow cannot run.</strong> {workflow.error}</Notice>
{/if}

<section>
  <header class="mb-2.5 flex items-center gap-2 px-1">
    <h2 class="text-sm font-semibold text-ink-strong">Run history</h2>
    <span class="text-xs text-ink-muted tabular-nums">{workflow.runCount}</span>
  </header>
  <div class="surface p-1.5">
    {#each workflow.runs as run (run.id)}
      <RunRow {run} inWorkflow />
    {:else}
      <EmptyState
        compact
        icon={CirclePlay}
        title="No runs yet"
        description={manual
          ? 'Run it manually, or wait for another declared trigger.'
          : 'The first matching event will appear here.'}
      />
    {/each}
  </div>
</section>

<Modal
  open={dispatchOpen}
  size="small"
  title="Run {workflow.name}?"
  description="Marl uses the workflow definition at the current indexed head of {workflow.branch}."
  onClose={() => !busy && (dispatchOpen = false)}
>
  <p class="inline-flex items-center gap-1.5 rounded-lg bg-surface-muted px-3 py-2 font-mono text-xs text-ink">
    <GitBranch size={13} />{workflow.branch}<span class="text-ink-muted">{workflow.commit.slice(0, 7)}</span>
  </p>
  {#if error}<Notice class="mt-4">{error}</Notice>{/if}
  {#snippet actions()}
    <Button size="small" disabled={busy} onclick={() => (dispatchOpen = false)}>Cancel</Button>
    <Button size="small" variant="primary" loading={busy} onclick={dispatch}><Play size={13} />Run workflow</Button>
  {/snippet}
</Modal>
