<script lang="ts">
  import GitBranch from '@lucide/svelte/icons/git-branch';
  import { keyboardScroll } from '#lib/actions/keyboard-scroll.js';
  import RunStateIcon from '#lib/runs/RunStateIcon.svelte';
  import { jobs, lineJobs, preamble, workflow, workflowPath } from './run-example.js';

  let selected = $state.raw(jobs[0]);

  function lineClass(index: number) {
    const job = lineJobs[index];
    if (!job) return 'text-ink';
    return job === selected.key ? 'bg-surface text-ink' : 'text-ink-faint';
  }
</script>

<figure
  class="grid min-w-0 gap-1.5 rounded-2xl bg-surface-muted p-1.5 min-[900px]:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]"
  aria-label="Workflow and run preview"
>
  <section class="min-w-0 pb-3" aria-label="Workflow file">
    <h3 class="px-3.5 pt-3.5 pb-3 font-mono text-xs text-ink-muted">{workflowPath}</h3>
    <div
      class="overflow-x-auto font-mono text-sm leading-[1.7] focus-visible:outline-offset-[-2px]"
      role="region"
      aria-label="Workflow source"
      {@attach keyboardScroll}
    >
      {#each workflow as line, index (index)}
        <code class={['block w-max min-w-full px-3.5 whitespace-pre transition-colors duration-200', lineClass(index)]}
          ><span class="inline-block w-7.5 text-ink-faint select-none">{index + 1}</span>{line}</code
        >
      {/each}
    </div>
  </section>

  <section class="flex min-w-0 flex-col rounded-lg bg-surface p-2" aria-label="Run">
    <header class="flex items-start gap-3 px-3 pt-3 pb-4">
      <RunStateIcon state="success" label="Succeeded" size={20} />
      <div class="min-w-0">
        <p class="text-base font-semibold text-ink-strong">
          Verify <span class="font-normal text-ink-muted">#214</span>
        </p>
        <p class="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-ink-muted">
          <span class="inline-flex items-center gap-1 font-mono text-ink"><GitBranch size={12} />share-search</span>
          <span class="font-mono">4e1b9c7</span>
        </p>
      </div>
    </header>
    <div class="grid grid-cols-2 gap-1" role="group" aria-label="Jobs">
      {#each jobs as job (job.key)}
        <button
          type="button"
          class={[
            'grid grid-cols-[16px_minmax(0,1fr)] items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors',
            job === selected ? 'bg-surface-muted' : 'hover:bg-surface-hover'
          ]}
          aria-pressed={job === selected}
          aria-controls="example-run-log"
          onclick={() => (selected = job)}
        >
          <RunStateIcon state="success" label="Succeeded" />
          <span class="min-w-0">
            <strong class="block truncate text-sm font-semibold text-ink-strong">{job.name}</strong>
            <span class="block truncate text-xs text-ink-muted">{job.runner}</span>
          </span>
        </button>
      {/each}
    </div>
    <pre
      id="example-run-log"
      class="mt-2 flex-1 overflow-x-auto rounded-md bg-surface-muted px-4 py-3.5 font-mono text-xs leading-5 focus-visible:outline-offset-[-2px]"
      role="region"
      aria-label={`${selected.name} log`}
      {@attach keyboardScroll}>{#each preamble as line, index (index)}<span class="block min-h-5 text-ink-muted"
          >{line}</span
        >{/each}{#each selected.log as line, index (index)}<span
          class={['block min-h-5', line.startsWith('──') ? 'font-semibold text-ink-strong' : 'text-ink']}>{line}</span
        >{/each}</pre>
  </section>
</figure>
