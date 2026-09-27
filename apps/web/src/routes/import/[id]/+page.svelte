<script lang="ts">
  import { page } from '$app/state';
  import { untrack } from 'svelte';
  import type { RepositoryImport } from '@marl/contracts';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import Check from '@lucide/svelte/icons/check';
  import { api } from '$lib/api';
  import LinkButton from '$lib/components/controls/LinkButton.svelte';
  import Notice from '$lib/components/feedback/Notice.svelte';
  import Spinner from '$lib/components/feedback/Spinner.svelte';
  import FormShell from '$lib/components/page/FormShell.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let current = $state<RepositoryImport>(untrack(() => data.import));
  const steps: Array<{ id: RepositoryImport['step']; label: string; count?: keyof RepositoryImport['stats'] }> = [
    { id: 'git', label: 'Git history' },
    { id: 'labels', label: 'Labels', count: 'labels' },
    { id: 'pulls', label: 'Pulls', count: 'pulls' },
    { id: 'issues', label: 'Issues', count: 'issues' },
    { id: 'comments', label: 'Comments', count: 'comments' },
    { id: 'releases', label: 'Releases', count: 'releases' }
  ];
  const position = $derived(
    current.step === 'finished' ? steps.length : steps.findIndex((step) => step.id === current.step)
  );
  const path = $derived(`${current.repository.owner}/${current.repository.name}`);

  $effect(() => {
    if (current.status !== 'running') return;
    const timer = setInterval(async () => {
      current = (await api<{ import: RepositoryImport }>(`/imports/${page.params.id}`)).import;
    }, 2500);
    return () => clearInterval(timer);
  });
</script>

<svelte:head><title>Importing {current.source} · Marl</title></svelte:head>
<FormShell
  title={current.status === 'completed'
    ? 'Import complete'
    : current.status === 'failed'
      ? 'Import stopped'
      : `Importing ${current.source}`}
  description={current.status === 'running'
    ? 'You can leave this page. The import keeps running and the repository fills in as it goes.'
    : undefined}
  backHref="/repositories"
  backLabel="Repositories"
>
  <ol class="grid gap-1">
    {#each steps as step, index (step.id)}
      <li class="flex min-h-10 items-center gap-3 rounded-lg px-2">
        <span class="grid size-5.5 place-items-center">
          {#if index < position}<Check
              size={16}
              class="text-success"
            />{:else if index === position && current.status === 'running'}<Spinner />{:else}<span
              class="size-2 rounded-full bg-line-strong"
            ></span>{/if}
        </span>
        <span class={['flex-1 text-sm', index <= position ? 'text-ink-strong' : 'text-ink-muted']}>{step.label}</span>
        {#if step.count && current.stats[step.count]}<span class="text-xs text-ink-muted tabular-nums"
            >{current.stats[step.count]?.toLocaleString()}</span
          >{/if}
      </li>
    {/each}
  </ol>
  {#if current.error}<Notice class="mt-4">{current.error}</Notice>{/if}
  <div class="mt-6 flex justify-end">
    <LinkButton variant={current.status === 'completed' ? 'primary' : 'secondary'} href="/{path}"
      >Open {path}<ArrowRight size={15} /></LinkButton
    >
  </div>
</FormShell>
