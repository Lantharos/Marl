<script lang="ts">
  import { goto } from '$app/navigation';
  import type { WorkflowSummary } from '@marl/contracts';
  import FileCode2 from '@lucide/svelte/icons/file-code-corner';
  import GitBranch from '@lucide/svelte/icons/git-branch';
  import Play from '@lucide/svelte/icons/play';
  import { api, MarlApiError } from '#lib/api.js';
  import Button from '#lib/components/controls/Button.svelte';
  import Notice from '#lib/components/feedback/Notice.svelte';
  import Modal from '#lib/components/overlays/Modal.svelte';
  import { encodeRepositoryPath, encodeRevision } from '#lib/repositories/repository-path.js';
  import { workflowTrigger } from '../workflow-triggers';

  let {
    workflow,
    owner,
    repository,
    canDispatch
  }: { workflow: WorkflowSummary; owner: string; repository: string; canDispatch: boolean } = $props();
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
        `/repositories/${owner}/${repository}/workflows/${workflow.id}/dispatch`,
        { method: 'POST', body: '{}' }
      );
      dispatchOpen = false;
      await goto(`/${owner}/${repository}/runs/${result.run.number}`);
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'The workflow could not be started.';
    } finally {
      busy = false;
    }
  }
</script>

<header class="mb-5 grid gap-4">
  <div class="flex flex-wrap items-start justify-between gap-4">
    <div class="min-w-0">
      <h2 class="text-xl font-semibold tracking-tight wrap-anywhere text-ink-strong">{workflow.name}</h2>
      <p class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-ink-muted">
        <a
          class="inline-flex items-center gap-1 font-mono hover:text-brand"
          href="/{owner}/{repository}/blob/{encodeRevision(workflow.branch)}/{encodeRepositoryPath(workflow.path)}"
          ><FileCode2 size={13} />{workflow.path}</a
        >
        <span class="inline-flex items-center gap-1 font-mono"
          ><GitBranch size={13} />{workflow.branch}<span class="text-ink-faint">{workflow.commit.slice(0, 7)}</span
          ></span
        >
        {#each workflow.triggers as trigger (trigger)}
          {@const { label, icon: Icon } = workflowTrigger(trigger)}
          <span class="inline-flex items-center gap-1"><Icon size={13} />{label}</span>
        {/each}
        <span>{workflow.jobs} {workflow.jobs === 1 ? 'job' : 'jobs'}</span>
      </p>
    </div>
    {#if manual && canDispatch}<Button variant="primary" disabled={!runnable} onclick={() => (dispatchOpen = true)}
        ><Play size={14} />Run workflow</Button
      >{/if}
  </div>
  {#if !workflow.active}
    <Notice tone="warning"
      ><strong class="font-semibold">This workflow is no longer active.</strong> Its definition is no longer present on {workflow.branch}.
      Its run history remains available.</Notice
    >
  {:else if workflow.status === 'invalid'}
    <Notice><strong class="font-semibold">This workflow cannot run.</strong> {workflow.error}</Notice>
  {/if}
</header>

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
