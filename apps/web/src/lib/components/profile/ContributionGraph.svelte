<script lang="ts">
  type Day = { date: string; count: number };
  let { contributions } = $props<{ contributions: Day[] }>();

  const cells = $derived(buildCalendar(contributions));
  const total = $derived(contributions.reduce((sum: number, day: Day) => sum + day.count, 0));

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
      return { date: key, count, level, future: date > end, label: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) };
    });
  }
</script>

<section class="contributions" aria-label="Contribution activity">
  <header><div><h2>Contributions</h2><p>{total} public {total === 1 ? 'contribution' : 'contributions'} in the last year</p></div><span>Past 53 weeks</span></header>
  <div class="scroll"><div class="graph" role="img" aria-label={`${total} public contributions over the past year`}>{#each cells as cell (cell.date)}<span aria-hidden="true" class:future={cell.future} data-level={cell.level} title={`${cell.label}: ${cell.count} ${cell.count === 1 ? 'contribution' : 'contributions'}`}></span>{/each}</div></div>
</section>

<style>
  .contributions{padding:25px 0;border-top:1px solid var(--border-subtle);border-bottom:1px solid var(--border-subtle)}header{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:17px}h2{margin:0;color:var(--text-strong);font-size:13px;font-weight:650}p{margin:4px 0 0;color:var(--text-faint);font-size:11px}header>span{color:var(--text-faint);font-size:11px}.scroll{overflow-x:auto;padding-bottom:4px}.graph{display:grid;width:100%;min-width:686px;grid-auto-flow:column;grid-template-columns:repeat(53,minmax(8px,1fr));grid-template-rows:repeat(7,10px);gap:3px}.graph span{width:100%;height:10px;border-radius:2px;background:var(--surface-muted)}[data-level='1']{background:color-mix(in srgb,var(--brand) 30%,var(--surface-muted))!important}[data-level='2']{background:color-mix(in srgb,var(--brand) 52%,var(--surface-muted))!important}[data-level='3']{background:color-mix(in srgb,var(--brand) 76%,var(--surface-muted))!important}[data-level='4']{background:var(--brand)!important}.graph .future{opacity:.22}
</style>
