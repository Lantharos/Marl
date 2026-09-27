<script lang="ts">
  type Day = { date: string; count: number };
  let { contributions }: { contributions: Day[] } = $props();

  const cells = $derived(buildCalendar(contributions));
  const total = $derived(contributions.reduce((sum, day) => sum + day.count, 0));

  function buildCalendar(days: Day[]) {
    const counts = new Map(days.map((day) => [day.date, day.count]));
    const today = new Date();
    const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - (52 * 7 + start.getUTCDay()));
    return Array.from({ length: 53 * 7 }, (_, index) => {
      const date = new Date(start);
      date.setUTCDate(start.getUTCDate() + index);
      const key = date.toISOString().slice(0, 10);
      const count = counts.get(key) ?? 0;
      const level = count === 0 ? 0 : count < 3 ? 1 : count < 6 ? 2 : count < 10 ? 3 : 4;
      return {
        date: key,
        count,
        level,
        future: date > end,
        label: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
      };
    });
  }
</script>

<section class="border-y border-line-subtle py-6" aria-label="Contribution activity">
  <header class="mb-4">
    <h2 class="text-sm font-semibold text-ink-strong">Contributions</h2>
    <p class="mt-1 text-xs text-ink-muted">
      {total} public {total === 1 ? 'contribution' : 'contributions'} in the last year
    </p>
  </header>
  <div class="overflow-x-auto pb-1">
    <div
      class="grid w-full min-w-172 auto-cols-fr grid-flow-col grid-rows-[repeat(7,10px)] gap-0.75"
      role="img"
      aria-label={`${total} public contributions over the past year`}
    >
      {#each cells as cell (cell.date)}<span
          aria-hidden="true"
          class={[
            'h-2.5 w-full rounded-[2px]',
            cell.future && 'opacity-20',
            cell.level === 0 && 'bg-surface-muted',
            cell.level === 1 && 'bg-brand/30',
            cell.level === 2 && 'bg-brand/50',
            cell.level === 3 && 'bg-brand/75',
            cell.level === 4 && 'bg-brand'
          ]}
          title={`${cell.label}: ${cell.count} ${cell.count === 1 ? 'contribution' : 'contributions'}`}
        ></span>{/each}
    </div>
  </div>
</section>
