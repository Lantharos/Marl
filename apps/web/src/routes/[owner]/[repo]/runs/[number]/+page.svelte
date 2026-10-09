<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { untrack } from 'svelte';
  import type { RunDetail, RunJob } from '@marl/contracts';
  import Cpu from '@lucide/svelte/icons/cpu';
  import ShieldCheck from '@lucide/svelte/icons/shield-check';
  import { api, MarlApiError } from '#lib/api.js';
  import Button from '#lib/components/controls/Button.svelte';
  import Notice from '#lib/components/feedback/Notice.svelte';
  import BackLink from '#lib/components/page/BackLink.svelte';
  import { ticking } from '#lib/runs/clock.svelte.js';
  import JobGraph from '#lib/runs/detail/JobGraph.svelte';
  import RunArtifacts from '#lib/runs/detail/RunArtifacts.svelte';
  import RunHeader from '#lib/runs/detail/RunHeader.svelte';
  import { elapsed } from '#lib/runs/duration.js';
  import { JobLog } from '#lib/runs/log/job-log.svelte.js';
  import LogViewer from '#lib/runs/log/LogViewer.svelte';
  import { awaitingCheckApproval } from '#lib/runs/run-state.js';
  import RunStateIcon from '#lib/runs/RunStateIcon.svelte';
  import type { PageProps } from './$types';

  let { data, params }: PageProps = $props();
  const owner = $derived(params.owner);
  const repo = $derived(params.repo);
  let run = $derived<RunDetail>(data.run);
  let actionBusy = $state<'cancel' | 'retry' | 'approve' | null>(null);
  let error = $state('');
  const activeRun = $derived(run.state === 'queued' || run.state === 'running');
  const awaitingApproval = $derived(awaitingCheckApproval(run));
  const now = $derived(ticking(activeRun));
  const defaultJob = $derived(initialJob(data.run.jobsDetail)?.key);
  const job = $derived(
    run.jobsDetail.find((item) => item.key === page.url.searchParams.get('job')) ??
      run.jobsDetail.find((item) => item.key === defaultJob) ??
      null
  );
  const jobId = $derived(job?.id);
  const jobActive = $derived(job?.state === 'queued' || job?.state === 'running');
  const log = $derived(jobId && !awaitingApproval ? new JobLog(jobId) : null);
  const jobDuration = $derived(job ? elapsed(job.startedAt, job.completedAt, now) : null);

  function initialJob(jobs: RunJob[]) {
    return (
      jobs.find((item) => item.state === 'failure') ?? jobs.find((item) => item.state === 'running') ?? jobs[0] ?? null
    );
  }

  async function refreshState() {
    const runId = run.id;
    try {
      const result = await api<{ run: Partial<RunDetail>; jobs: Array<Partial<RunJob> & { id: string }> }>(
        `/repositories/${owner}/${repo}/runs/${params.number}/state`
      );
      if (run.id !== runId) return;
      run = {
        ...run,
        ...result.run,
        jobsDetail: run.jobsDetail.map((item) => ({ ...item, ...result.jobs.find((next) => next.id === item.id) }))
      };
      if (log) await log.catchUp();
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'Run status could not be updated.';
    }
  }

  async function action(kind: 'cancel' | 'retry') {
    if (actionBusy) return;
    actionBusy = kind;
    error = '';
    try {
      const result = await api<{ state?: RunDetail['state']; run?: { number: number } }>(
        `/repositories/${owner}/${repo}/runs/${params.number}/${kind}`,
        { method: 'POST', body: '{}' }
      );
      if (kind === 'retry' && result.run) {
        await goto(`/${owner}/${repo}/runs/${result.run.number}`);
      } else if (result.state) {
        run = {
          ...run,
          state: result.state,
          jobsDetail: run.jobsDetail.map((item) =>
            ['queued', 'running'].includes(item.state) ? { ...item, state: 'canceled' } : item
          )
        };
      }
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : `Run could not be ${kind}ed.`;
    } finally {
      actionBusy = null;
    }
  }

  async function approveChecks() {
    if (actionBusy || !awaitingApproval || !run.canApproveChecks) return;
    const runId = run.id;
    actionBusy = 'approve';
    error = '';
    try {
      await api(`/repositories/${owner}/${repo}/runs/${params.number}/approve`, { method: 'POST', body: '{}' });
      if (run.id === runId) await refreshState();
    } catch (cause) {
      if (run.id === runId) error = cause instanceof MarlApiError ? cause.message : 'Checks could not be approved.';
    } finally {
      if (run.id === runId) actionBusy = null;
    }
  }

  $effect(() => {
    void data.run.id;
    actionBusy = null;
    error = '';
  });

  $effect(() => {
    if (!log) return;
    untrack(() => void log.catchUp());
    return () => log.close();
  });

  $effect(() => {
    if (!log || !jobActive) return;
    return log.follow();
  });

  $effect(() => {
    const runId = data.run.id;
    if (!activeRun) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const poll = async () => {
      await refreshState();
      if (!stopped && run.id === runId && ['queued', 'running'].includes(run.state))
        timer = setTimeout(poll, document.hidden || awaitingApproval ? 10_000 : 2_000);
    };
    const visible = () => {
      if (document.hidden) return;
      clearTimeout(timer);
      void poll();
    };
    timer = setTimeout(poll, awaitingApproval ? 10_000 : 2_000);
    document.addEventListener('visibilitychange', visible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  });
</script>

<svelte:head><title>{run.name} #{run.number} · {owner}/{repo} · Marl</title></svelte:head>

<BackLink
  href={run.workflowId ? `/${owner}/${repo}/runs/workflows/${run.workflowId}` : `/${owner}/${repo}/runs`}
  label={run.name}
/>
<RunHeader
  {run}
  {owner}
  repository={repo}
  canAct={data.repository.permissions.push}
  {now}
  busy={actionBusy}
  onaction={action}
/>

{#if error}<Notice class="mb-5">{error}</Notice>{/if}

{#if awaitingApproval}
  <section class="grid justify-items-center gap-2 surface px-6 py-14 text-center">
    <span class="mb-1 grid size-11 place-items-center rounded-full bg-warning-soft text-warning"
      ><ShieldCheck size={20} /></span
    >
    <h2 class="text-base font-semibold text-ink-strong">Checks need approval</h2>
    <p class="max-w-[46ch] text-sm text-ink-muted">
      A maintainer needs to approve this contribution before its checks can use a runner.
    </p>
    {#if run.canApproveChecks}<Button
        class="mt-2"
        variant="primary"
        loading={actionBusy === 'approve'}
        disabled={Boolean(actionBusy)}
        onclick={approveChecks}>Approve checks</Button
      >{/if}
  </section>
{:else}
  <div class="grid min-w-0 gap-6">
    {#if run.jobsDetail.length > 1 && job}<JobGraph
        jobs={run.jobsDetail}
        selected={job.id}
        {awaitingApproval}
        {now}
      />{/if}
    {#if job && log}
      <section class="grid min-w-0 gap-3" aria-labelledby="job-title">
        <header class="flex flex-wrap items-center gap-x-4 gap-y-1 px-1">
          <h2 id="job-title" class="flex min-w-0 items-center gap-2 text-lg font-semibold text-ink-strong">
            <RunStateIcon state={job.state} size={17} /><span class="truncate">{job.name}</span>
          </h2>
          <p class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
            {#if job.runner}<span class="inline-flex items-center gap-1"><Cpu size={14} />{job.runner.name}</span
              >{:else if job.state === 'queued'}<span>Waiting for {job.requiredLabels.join(', ')}</span>{/if}
            {#if jobDuration}<span class="tabular-nums">{jobDuration}</span>{/if}
            {#if job.attempt > 1}<span>Attempt {job.attempt}</span>{/if}
            {#if job.exitCode}<span class="font-mono text-xs">exit {job.exitCode}</span>{/if}
          </p>
        </header>
        {#key job.id}<LogViewer {log} {job} {now} />{/key}
      </section>
      {#if job.artifacts.length}<RunArtifacts artifacts={job.artifacts} />{/if}
    {/if}
  </div>
{/if}
