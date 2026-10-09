<script lang="ts">
  import { untrack } from 'svelte';
  import type { RunJob } from '@marl/contracts';
  import RunStateIcon from '../RunStateIcon.svelte';
  import { elapsed } from '../duration';

  let {
    jobs,
    selected,
    awaitingApproval,
    now
  }: { jobs: RunJob[]; selected: string; awaitingApproval: boolean; now: number } = $props();

  const width = 208;
  const height = 44;
  const columnGap = 48;
  const rowGap = 10;

  function revealSelected(container: HTMLElement) {
    const id = selected;
    untrack(() => {
      const node = graph.nodes.find((candidate) => candidate.job.id === id);
      if (node && node.x + width > container.clientWidth) container.scrollLeft = node.x - columnGap;
    });
  }

  const graph = $derived.by(() => {
    const byKey = new Map(jobs.map((job) => [job.key, job]));
    const depths = new Map<string, number>();
    const depth = (job: RunJob): number => {
      const known = depths.get(job.key);
      if (known !== undefined) return known;
      depths.set(job.key, 0);
      const parents = job.needs.map((need) => byKey.get(need)).filter((parent) => parent !== undefined);
      const value = parents.length ? 1 + Math.max(...parents.map(depth)) : 0;
      depths.set(job.key, value);
      return value;
    };
    const rows = new Map<number, number>();
    const nodes = jobs.map((job) => {
      const column = depth(job);
      const row = rows.get(column) ?? 0;
      rows.set(column, row + 1);
      return { job, x: column * (width + columnGap), y: row * (height + rowGap) };
    });
    const positions = new Map(nodes.map((node) => [node.job.key, node]));
    const edges = nodes.flatMap((node) =>
      node.job.needs.flatMap((need) => {
        const parent = positions.get(need);
        if (!parent) return [];
        const from = { x: parent.x + width, y: parent.y + height / 2 };
        const to = { x: node.x, y: node.y + height / 2 };
        const bend = columnGap / 2;
        return [
          {
            key: `${need}-${node.job.key}`,
            active: node.job.id === selected || parent.job.id === selected,
            path: `M${from.x} ${from.y}C${from.x + bend} ${from.y} ${to.x - bend} ${to.y} ${to.x} ${to.y}`
          }
        ];
      })
    );
    return {
      nodes,
      edges,
      width: Math.max(...nodes.map((node) => node.x)) + width,
      height: Math.max(...nodes.map((node) => node.y)) + height
    };
  });
</script>

<nav class="overflow-x-auto surface p-3 sm:p-4" aria-label="Jobs" {@attach revealSelected}>
  <div class="relative" style:width="{graph.width}px" style:height="{graph.height}px">
    <svg class="absolute inset-0 overflow-visible" width={graph.width} height={graph.height} aria-hidden="true">
      {#each graph.edges as edge (edge.key)}
        <path
          d={edge.path}
          fill="none"
          stroke-width="1.5"
          class={edge.active ? 'stroke-ink-faint' : 'stroke-line-strong'}
        />
      {/each}
    </svg>
    {#each graph.nodes as node (node.job.id)}
      {@const current = node.job.id === selected}
      {@const duration = elapsed(node.job.startedAt, node.job.completedAt, now)}
      <a
        href="?job={encodeURIComponent(node.job.key)}"
        data-sveltekit-reset="false"
        data-sveltekit-replacestate
        aria-current={current ? 'true' : undefined}
        class={[
          'absolute flex items-center gap-2.5 rounded-lg px-3 text-sm transition-colors',
          current
            ? 'bg-surface-raised text-ink-strong shadow-surface'
            : 'bg-surface-muted text-ink hover:bg-surface-hover hover:text-ink-strong'
        ]}
        style:left="{node.x}px"
        style:top="{node.y}px"
        style:width="{width}px"
        style:height="{height}px"
      >
        <RunStateIcon state={node.job.state} {awaitingApproval} />
        <span class="min-w-0 flex-1 truncate font-semibold">{node.job.name}</span>
        {#if duration}<span class="shrink-0 text-xs text-ink-muted tabular-nums">{duration}</span>{/if}
      </a>
    {/each}
  </div>
</nav>
