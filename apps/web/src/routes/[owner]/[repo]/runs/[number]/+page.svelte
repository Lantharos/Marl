<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { untrack } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';
  import type { RunDetail, RunJob } from '@marl/contracts';
  import Archive from 'lucide-svelte/icons/archive';
  import CircleAlert from 'lucide-svelte/icons/circle-alert';
  import CircleCheck from 'lucide-svelte/icons/circle-check';
  import CircleDot from 'lucide-svelte/icons/circle-dot';
  import GitBranch from 'lucide-svelte/icons/git-branch';
  import RotateCcw from 'lucide-svelte/icons/rotate-ccw';
  import Square from 'lucide-svelte/icons/square';
  import Terminal from 'lucide-svelte/icons/terminal';
  import { api, apiTextCursorAll, MarlApiError } from '$lib/api';
  import Time from '$lib/components/Time.svelte';
  import Button from '$lib/components/Button.svelte';
  import type { PageData } from './$types';

  let { data } = $props<{ data: PageData }>();
  const owner = $derived($page.params.owner);
  const repo = $derived($page.params.repo);
  const number = $derived(Number($page.params.number));
  let run = $derived<RunDetail>(data.run);
  let selected = $derived(data.selected);
  let logs = $derived(data.logs);
  let logCursor = $derived(data.logCursor);
  let logMore = $derived(data.logMore);
  let logUnavailable = $derived(data.logUnavailable);
  let actionBusy = $state(false);
  let error = $state('');
  let logFetch: Promise<void> | null = null;
  let logFetchJob = '';
  const pendingLogs = new SvelteMap<number, string>();
  const job = $derived(run.jobsDetail.find((item) => item.id === selected) ?? run.jobsDetail[0] ?? null);
  const activeRun = $derived(run.state === 'queued' || run.state === 'running');

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
    if (!current) return;
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
    actionBusy = true;
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
      actionBusy = false;
    }
  }

  $effect(() => {
    data.run.id;
    data.selected;
    pendingLogs.clear();
    logFetch = null;
    logFetchJob = '';
    actionBusy = false;
    error = '';
  });

  $effect(() => {
    const id = job?.id;
    if (!id || !logMore) return;
    untrack(() => void appendLogs());
  });

  $effect(() => {
    const id = job?.id;
    if (!id || !['queued', 'running'].includes(job.state) || typeof window === 'undefined') return;
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
        timer = setTimeout(poll, document.hidden ? 10_000 : 2_000);
      }
    };
    const visible = () => {
      if (!document.hidden && ['queued', 'running'].includes(run.state)) {
        clearTimeout(timer);
        void poll();
      }
    };
    timer = setTimeout(poll, 2_000);
    document.addEventListener('visibilitychange', visible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  });
</script>

<svelte:head><title>{run.name} · {owner}/{repo} · Marl</title></svelte:head>

<header class="run-head">
  <div class="title">
    <span class="run-icon {run.state}">
      {#if run.state === 'success'}<CircleCheck size={18} />
      {:else if run.state === 'failure'}<CircleAlert size={18} />
      {:else}<CircleDot size={18} />{/if}
    </span>
    <div><h1>{run.name}</h1><p>Run #{run.number} · {run.trigger}{run.actor ? ` by ${run.actor}` : ''}</p></div>
  </div>
  {#if run.state === 'queued' || run.state === 'running'}
    <Button loading={actionBusy} onclick={() => action('cancel')}><Square size={14} />Cancel</Button>
  {:else}
    <Button loading={actionBusy} onclick={() => action('retry')}><RotateCcw size={14} />Run again</Button>
  {/if}
</header>

<div class="run-meta">
  <span><GitBranch size={13} />{run.branch}</span>
  <code>{run.commit.slice(0, 7)}</code>
  <span>{run.jobs} {run.jobs === 1 ? 'job' : 'jobs'}</span>
  <Time value={run.queuedAt} />
  <span class="state-text {run.state}">{run.cancellationReason === 'superseded' ? 'superseded' : run.state}</span>
</div>

{#if error}<p class="notice" role="alert">{error}</p>{/if}

<div class="run-layout">
  <aside>
    <h2>Jobs</h2>
    {#each run.jobsDetail as item (item.id)}
      <button class:active={item.id === job?.id} onclick={() => choose(item.id)}>
        <span class="job-icon {item.state}">
          {#if item.state === 'success'}<CircleCheck size={16} />
          {:else if item.state === 'failure'}<CircleAlert size={16} />
          {:else}<CircleDot size={16} />{/if}
        </span>
        <span>
          <strong>{item.name}</strong>
          <small>{item.runner?.name ?? (item.state === 'queued' ? `Waiting for ${item.requiredLabels.join(', ')}` : 'No runner')}</small>
        </span>
      </button>
    {/each}
  </aside>
  <main>
    {#if job}
      <header class="job-head">
        <div><h2>{job.name}</h2><p>{job.runner ? `Ran on ${job.runner.name}` : `Requires ${job.requiredLabels.join(', ')}`}</p></div>
        <span>{job.state}</span>
      </header>
      <section class="terminal">
        <header><Terminal size={14} /><span>Log</span><small>{job.logBytes} bytes</small></header>
        {#if logUnavailable}
          <p class="log-error"><CircleAlert size={15} />Stored log output is unavailable. Run metadata and artifacts are unaffected.</p>
        {:else}
          <pre>{logs || (job.state === 'queued' ? 'Waiting for a matching runner…' : 'No log output.')}</pre>
        {/if}
      </section>
      {#if job.artifacts.length}
        <section class="artifacts">
          <h3>Artifacts</h3>
          {#each job.artifacts as artifact (artifact.id)}
            <a href="/api/v1/artifacts/{artifact.id}"><Archive size={15} /><span><strong>{artifact.name}</strong><small>{artifact.byteSize} bytes</small></span></a>
          {/each}
        </section>
      {/if}
    {/if}
  </main>
</div>

<style>
  .run-head{display:flex;align-items:center;justify-content:space-between;gap:20px;padding-bottom:20px}.title{display:flex;align-items:center;gap:12px}.run-icon{display:grid;width:40px;height:40px;place-items:center;border-radius:9px;background:var(--surface-muted);color:var(--text-muted)}.run-icon.success{background:var(--success-soft);color:var(--success)}.run-icon.failure{background:var(--danger-soft);color:var(--danger)}.run-icon.running,.run-icon.queued{background:var(--brand-soft);color:var(--brand)}h1{margin:0;color:var(--text-strong);font-size:23px;letter-spacing:-.03em}.title p{margin:5px 0 0;color:var(--text-muted);font-size:12px}.action{display:inline-flex;height:36px;align-items:center;gap:7px;padding:0 11px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);cursor:pointer;font-size:12px}.run-meta{display:flex;align-items:center;gap:13px;min-height:42px;border-top:1px solid var(--border);border-bottom:1px solid var(--border);color:var(--text-muted);font-size:12px}.run-meta span{display:inline-flex;align-items:center;gap:5px}.run-meta code{color:var(--text)}.run-meta :global(time){font-size:12px}.state-text{margin-left:auto;text-transform:capitalize}.state-text.success{color:var(--success)}.state-text.failure{color:var(--danger)}.state-text.running,.state-text.queued{color:var(--brand)}.notice{color:var(--danger);font-size:12px}.run-layout{display:grid;grid-template-columns:250px minmax(0,1fr);gap:32px;padding-top:28px}.run-layout>aside{border-right:1px solid var(--border);padding-right:16px}.run-layout aside h2{margin:0 0 9px 7px;color:var(--text-muted);font-size:12px;font-weight:650}.run-layout aside button{display:grid;width:100%;grid-template-columns:24px minmax(0,1fr);align-items:center;gap:8px;padding:10px 8px;border:0;border-radius:6px;background:transparent;color:var(--text);cursor:pointer;text-align:left}.run-layout aside button:hover,.run-layout aside button.active{background:var(--surface-muted)}.job-icon{display:grid;place-items:center;color:var(--text-muted)}.job-icon.success{color:var(--success)}.job-icon.failure{color:var(--danger)}.job-icon.running,.job-icon.queued{color:var(--brand)}.run-layout aside strong,.run-layout aside small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.run-layout aside strong{color:var(--text-strong);font-size:13px}.run-layout aside small{margin-top:3px;color:var(--text-muted);font-size:11px}.run-layout>main{min-width:0}.job-head{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:15px}.job-head h2{margin:0;color:var(--text-strong);font-size:17px}.job-head p{margin:5px 0 0;color:var(--text-muted);font-size:12px}.job-head>span{color:var(--text);font-size:12px;text-transform:capitalize}.terminal{overflow:hidden;border:1px solid var(--border);border-radius:8px;background:#09090a}.terminal>header{display:flex;align-items:center;gap:7px;min-height:39px;padding:0 12px;border-bottom:1px solid #242427;color:#aaa8a2;font-size:12px}.terminal header small{margin-left:auto;color:#777570}.terminal pre{min-height:300px;max-height:560px;overflow:auto;margin:0;padding:15px;color:#dedcd7;font-family:"SFMono-Regular",Consolas,monospace;font-size:12px;line-height:1.65;white-space:pre-wrap}.log-error{display:flex;min-height:220px;align-items:center;justify-content:center;gap:8px;margin:0;padding:20px;color:var(--danger);font-size:12px}.artifacts{margin-top:26px}.artifacts h3{margin:0 0 9px;color:var(--text-strong);font-size:14px}.artifacts a{display:grid;grid-template-columns:24px 1fr;align-items:center;gap:8px;padding:11px 4px;border-top:1px solid var(--border-subtle);color:var(--text-muted);text-decoration:none}.artifacts strong,.artifacts small{display:block}.artifacts strong{color:var(--text-strong);font-size:12px}.artifacts small{margin-top:3px;color:var(--text-muted);font-size:11px}@media(max-width:700px){.run-layout{grid-template-columns:1fr}.run-layout>aside{display:flex;overflow-x:auto;border-right:0;border-bottom:1px solid var(--border);padding:0 0 12px}.run-layout aside h2{display:none}.run-layout aside button{min-width:200px}.run-head{align-items:flex-start}.title h1{font-size:20px}.terminal pre{min-height:240px}}
</style>
