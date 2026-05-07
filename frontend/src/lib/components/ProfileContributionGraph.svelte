<script lang="ts">
	import type { ProfileContributionDay } from '$lib/api';

	let { days }: { days: ProfileContributionDay[] } = $props();

	const cells = $derived(buildCells(days));
	const total = $derived(days.reduce((sum, day) => sum + day.count, 0));
	const max = $derived(Math.max(1, ...days.map((day) => day.count)));
	const months = $derived(monthLabels(cells));

	function buildCells(items: ProfileContributionDay[]) {
		const byDate = new Map(items.map((item) => [item.date, item.count]));
		const end = new Date();
		end.setHours(0, 0, 0, 0);
		const start = new Date(end);
		start.setDate(start.getDate() - 364);
		const offset = start.getDay();
		start.setDate(start.getDate() - offset);
		const values: { date: string; count: number; week: number; day: number }[] = [];
		for (let index = 0; index < 371; index += 1) {
			const date = new Date(start);
			date.setDate(start.getDate() + index);
			const key = date.toISOString().slice(0, 10);
			values.push({
				date: key,
				count: byDate.get(key) ?? 0,
				week: Math.floor(index / 7),
				day: date.getDay()
			});
		}
		return values;
	}

	function monthLabels(values: { date: string; week: number }[]) {
		const labels: { label: string; week: number }[] = [];
		let last = '';
		for (const cell of values) {
			const date = new Date(`${cell.date}T00:00:00`);
			const label = date.toLocaleString(undefined, { month: 'short' });
			if (date.getDate() <= 7 && label !== last) {
				labels.push({ label, week: cell.week });
				last = label;
			}
		}
		return labels;
	}

	function cellColor(count: number) {
		if (count <= 0) return '#1a1a18';
		const ratio = count / max;
		if (ratio > 0.75) return '#d9a66c';
		if (ratio > 0.45) return '#b9844e';
		if (ratio > 0.2) return '#6f8f5f';
		return '#31462f';
	}
</script>

<section class="rounded border border-[#2a2a28] bg-[#141412] p-4">
	<div class="flex items-center justify-between gap-3">
		<h3 class="text-sm font-medium text-[#f0eee4]">{total} contributions in the last year</h3>
		<div class="hidden items-center gap-1 text-xs text-[#6f6b5f] sm:flex">
			<span>Less</span>
			<span class="h-2.5 w-2.5 rounded-sm" style:background-color="#1a1a18"></span>
			<span class="h-2.5 w-2.5 rounded-sm" style:background-color="#31462f"></span>
			<span class="h-2.5 w-2.5 rounded-sm" style:background-color="#6f8f5f"></span>
			<span class="h-2.5 w-2.5 rounded-sm" style:background-color="#b9844e"></span>
			<span class="h-2.5 w-2.5 rounded-sm" style:background-color="#d9a66c"></span>
			<span>More</span>
		</div>
	</div>
	<div class="mt-4 pb-1">
		<div class="grid grid-cols-[28px_minmax(0,1fr)] gap-x-2">
			<div></div>
			<div class="relative h-5">
				{#each months as month}
					<span class="absolute top-0 text-xs text-[#8c887e]" style:left={`${(month.week / 53) * 100}%`}>{month.label}</span>
				{/each}
			</div>
			<div class="grid grid-rows-7 gap-[3px] text-xs text-[#8c887e]">
				<span class="h-2 leading-none"></span>
				<span class="h-2 leading-none">Mon</span>
				<span class="h-2 leading-none"></span>
				<span class="h-2 leading-none">Wed</span>
				<span class="h-2 leading-none"></span>
				<span class="h-2 leading-none">Fri</span>
				<span class="h-2 leading-none"></span>
			</div>
			<div class="grid grid-flow-col grid-cols-[repeat(53,minmax(0,1fr))] grid-rows-7 gap-[3px]">
				{#each cells as cell}
					<span
						class="aspect-square min-h-1.5 min-w-1.5 rounded-sm"
						style:background-color={cellColor(cell.count)}
						title={`${cell.count} contributions on ${cell.date}`}
						aria-label={`${cell.count} contributions on ${cell.date}`}
					></span>
				{/each}
			</div>
		</div>
	</div>
</section>
