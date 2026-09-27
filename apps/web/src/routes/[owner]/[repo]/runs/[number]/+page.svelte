<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { untrack } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';
  import type { RunDetail, RunJob } from '@marl/contracts';
  import Archive from '@lucide/svelte/icons/archive';
  import GitBranch from '@lucide/svelte/icons/git-branch';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import ShieldCheck from '@lucide/svelte/icons/shield-check';
  import Square from '@lucide/svelte/icons/square';
  import { api, apiTextCursorAll, MarlApiError } from '$lib/api';
  import { formatBytes } from '$lib/bytes';
  import Button from '$lib/components/controls/Button.svelte';
  import Notice from '$lib/components/feedback/Notice.svelte';
  import BackLink from '$lib/components/page/BackLink.svelte';
  import Time from '$lib/components/page/Time.svelte';
  import { awaitingCheckApproval, runStateLabel } from '$lib/runs/run-state';
  import RunLog from '$lib/runs/RunLog.svelte';
  import RunStateIcon from '$lib/runs/RunStateIcon.svelte';
  import { runOrigin } from '$lib/runs/workflow-triggers';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const owner = $derived(page.params.owner);
  const repo = $derived(page.params.repo);
  const number = $derived(Number(page.params.number));
  let run = $derived<RunDetail>(data.run);
  let selected = $derived(data.selected);
  let logs = $derived(data.logs);
  let logCursor = $derived(data.logCursor);
  let logMore = $derived(data.logMore);
  let logUnavailable = $derived(data.logUnavailable);
  let actionBusy = $state<'cancel' | 'retry' | 'approve' | null>(null);
  let error = $state('');
  let logFetch: Promise<void> | null = null;
  let logFetchJob = '';
  const pendingLogs = new SvelteMap<number, string>();
  const job = $derived(run.jobsDetail.find((item) => item.id === selected) ?? run.jobsDetail[0] ?? null);
  const activeRun = $derived(run.state === 'queued' || run.state === 'running');
  const awaitingApproval = $derived(awaitingCheckApproval(run));

  function flushPendingLogs(jobId: string) {
    if (job?.id !== jobId) return;
    const parts: string[] = [];
    while (pendingLogs.has(logCursor + 1)) {
      const sequence = logCursor + 1;
      parts.push(pendingLogs.get(sequence)!);
      pendingLogs.delete(sequence);
      logCursor = sequence;
    }
    if (parts.length) logs += parts.join('');
  }

  async function loadLogs(jobId: string, requestedAfter: number) {
    try {
      const next = await apiTextCursorAll(`/jobs/${jobId}/logs`, requestedAfter);
      if (job?.id !== jobId || logCursor !== requestedAfter) return;
      if (next.text) logs += next.text;
      logCursor = next.cursor;
      logMore = false;
      for (const sequence of pendingLogs.keys()) if (sequence <= logCursor) pendingLogs.delete(sequence);
      flushPendingLogs(jobId);
      logUnavailable = false;
    } catch {
      if (job?.id === jobId) logUnavailable = true;
    }
  }

  async function appendLogs() {
    const current = job;
    if (!current || awaitingApproval) return;
    if (logFetch && logFetchJob === current.id) return logFetch;
    const request = loadLogs(current.id, logCursor);
    logFetch = request;
    logFetchJob = current.id;
    try {
      await request;
    } finally {
      if (logFetch === request) {
        logFetch = null;
        logFetchJob = '';
      }
    }
  }

  async function refreshState() {
    if (!['queued', 'running'].includes(run.state)) return;
    const runId = run.id;
    const route = { owner, repo, number };
    try {
      const result = await api<{ run: Partial<RunDetail>; jobs: Array<Partial<RunJob> & { id: string }> }>(
        `/repositories/${route.owner}/${route.repo}/runs/${route.number}/state`
      );
      if (run.id !== runId) return;
      run = {
        ...run,
        ...result.run,
        jobsDetail: run.jobsDetail.map((item) => ({ ...item, ...result.jobs.find((next) => next.id === item.id) }))
      };
      await appendLogs();
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'Run status could not be updated.';
    }
  }

  async function choose(id: string) {
    if (id === job?.id) return;
    selected = id;
    logs = '';
    logCursor = -1;
    logMore = true;
    logUnavailable = false;
    pendingLogs.clear();
    logFetch = null;
    logFetchJob = '';
    await appendLogs();
  }

  async function action(kind: 'cancel' | 'retry') {
    if (actionBusy) return;
    actionBusy = kind;
    error = '';
    try {
      const result = await api<{ state?: RunDetail['state']; run?: { number: number } }>(
        `/repositories/${owner}/${repo}/runs/${number}/${kind}`,
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
      await api(`/repositories/${owner}/${repo}/runs/${number}/approve`, { method: 'POST', body: '{}' });
      if (run.id !== runId) return;
      await refreshState();
    } catch (cause) {
      if (run.id === runId) error = cause instanceof MarlApiError ? cause.message : 'Checks could not be approved.';
    } finally {
      if (run.id === runId) actionBusy = null;
    }
  }

  $effect(() => {
    data.run.id;
    data.selected;
    pendingLogs.clear();
    logFetch = null;
    logFetchJob = '';
    actionBusy = null;
    error = '';
  });

  $effect(() => {
    const id = job?.id;
    if (!id || !logMore || awaitingApproval) return;
    untrack(() => void appendLogs());
  });

  $effect(() => {
    const id = job?.id;
    if (!id || !['queued', 'running'].includes(job.state) || awaitingApproval) return;
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${location.host}/api/v1/jobs/${id}/live`);
    socket.binaryType = 'arraybuffer';
    socket.onmessage = (event) => {
      if (!(event.data instanceof ArrayBuffer) || event.data.byteLength < 8) return;
      const sequence = Number(new DataView(event.data).getBigUint64(0));
      if (!Number.isSafeInteger(sequence) || sequence <= logCursor || pendingLogs.has(sequence)) return;
      pendingLogs.set(sequence, new TextDecoder().decode(event.data.slice(8)));
      flushPendingLogs(id);
      if (pendingLogs.size) void appendLogs();
    };
    return () => socket.close();
  });

  $effect(() => {
    const runId = data.run.id;
    if (!activeRun) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let polling = false;
    const poll = async () => {
      if (polling) return;
      polling = true;
      await refreshState();
      polling = false;
      if (!stopped && run.id === runId && ['queued', 'running'].includes(run.state)) {
        timer = setTimeout(poll, document.hidden || awaitingApproval ? 10_000 : 2_000);
      }
    };
    const visible = () => {
      if (!document.hidden && ['queued', 'running'].includes(run.state)) {
        clearTimeout(timer);
        void poll();
      }
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
<header class="mt-5 mb-6 flex flex-wrap items-start justify-between gap-5">
  <div class="flex min-w-0 gap-3.5">
    <span class="grid size-10.5 shrink-0 place-items-center rounded-xl bg-surface-muted"
      ><RunStateIcon state={run.state} {awaitingApproval} label={runStateLabel(run)} size={20} /></span
    >
    <div class="min-w-0">
      <h1 class="text-2xl font-semibold tracking-tight wrap-anywhere text-ink-strong">
        {run.name} <span class="font-normal text-ink-muted">#{run.number}</span>
      </h1>
      <p class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
        <span class="font-semibold text-ink capitalize">{runStateLabel(run)}</span>
        <span aria-hidden="true">·</span>{runOrigin(run)}
        <span aria-hidden="true">·</span><Time value={run.queuedAt} class="text-ink-muted" />
        <span class="inline-flex items-center gap-1 rounded bg-surface-muted px-1.5 py-0.5 font-mono text-xs text-ink"
          ><GitBranch size={12} />{run.branch}<a
            class="text-ink-muted hover:text-brand"
            href="/{owner}/{repo}/commit/{run.commit}">{run.commit.slice(0, 7)}</a
          ></span
        >
      </p>
    </div>
  </div>
  {#if data.repository.permissions.push}
    {#if activeRun}
      <Button loading={actionBusy === 'cancel'} disabled={Boolean(actionBusy)} onclick={() => action('cancel')}
        ><Square size={14} />Cancel run</Button
      >
    {:else}
      <Button loading={actionBusy === 'retry'} disabled={Boolean(actionBusy)} onclick={() => action('retry')}
        ><RotateCcw size={14} />Run again</Button
      >
    {/if}
  {/if}
</header>

{#if error}<Notice class="mb-5">{error}</Notice>{/if}

<div class="grid items-start gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
  <nav class="grid gap-0.5 lg:sticky lg:top-20" aria-label="Jobs">
    <h2 class="mb-1.5 px-3 text-sm font-semibold text-ink-strong">
      Jobs <span class="font-normal text-ink-muted tabular-nums">{run.jobsDetail.length}</span>
    </h2>
    {#each run.jobsDetail as item (item.id)}
      <button
        type="button"
        aria-current={item.id === job?.id}
        class={[
          'grid grid-cols-[18px_minmax(0,1fr)] items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors',
          item.id === job?.id ? 'bg-surface-muted' : 'hover:bg-surface-hover'
        ]}
        onclick={() => choose(item.id)}
      >
        <RunStateIcon state={item.state} {awaitingApproval} />
        <span class="min-w-0">
          <strong class="block truncate text-sm font-semibold text-ink-strong">{item.name}</strong>
          <span class="block truncate text-xs text-ink-muted"
            >{awaitingApproval
              ? 'Awaiting approval'
              : (item.runner?.name ??
                (item.state === 'queued' ? `Waiting for ${item.requiredLabels.join(', ')}` : 'No runner'))}</span
          >
        </span>
      </button>
    {/each}
  </nav>

  <div class="grid min-w-0 gap-5">
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
    {:else if job}
      <header class="flex flex-wrap items-center justify-between gap-3">
        <div class="min-w-0">
          <h2 class="truncate text-lg font-semibold text-ink-strong">{job.name}</h2>
          <p class="mt-0.5 text-sm text-ink-muted">
            {job.runner ? `Ran on ${job.runner.name}` : `Requires ${job.requiredLabels.join(', ')}`}
          </p>
        </div>
        <span class="inline-flex items-center gap-1.5 text-sm font-semibold text-ink capitalize"
          ><RunStateIcon state={job.state} size={15} />{job.state}</span
        >
      </header>
      <RunLog text={logs} bytes={job.logBytes} unavailable={logUnavailable} waiting={job.state === 'queued'} />
      {#if job.artifacts.length}
        <section>
          <h3 class="mb-2 text-sm font-semibold text-ink-strong">Artifacts</h3>
          <div class="surface p-1.5">
            {#each job.artifacts as artifact (artifact.id)}
              <a
                class="group grid grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-lg px-3 py-2.5 transition-colors hover:bg-surface-hover"
                href="/api/v1/artifacts/{artifact.id}"
              >
                <Archive size={15} class="text-ink-muted" />
                <strong class="truncate text-sm font-semibold text-ink-strong group-hover:text-brand"
                  >{artifact.name}</strong
                >
                <span class="text-xs text-ink-muted tabular-nums">{formatBytes(artifact.byteSize)}</span>
              </a>
            {/each}
          </div>
        </section>
      {/if}
    {/if}
  </div>
</div>
