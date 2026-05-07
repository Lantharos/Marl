<script lang="ts">
	import CalendarDays from 'lucide-svelte/icons/calendar-days';
	import ChevronLeft from 'lucide-svelte/icons/chevron-left';
	import ChevronRight from 'lucide-svelte/icons/chevron-right';
	import X from 'lucide-svelte/icons/x';

	let { from = $bindable(''), to = $bindable('') } = $props();
	let open = $state(false);
	let cursor = $state(monthStart(from || to || todayKey()));
	let choosing: 'from' | 'to' = $state('from');

	const days = $derived(monthDays(cursor));
	const label = $derived(rangeLabel(from, to));

	function todayKey() {
		return new Date().toISOString().slice(0, 10);
	}

	function monthStart(value: string) {
		const date = new Date(`${value}T00:00:00`);
		return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
	}

	function monthDays(value: string) {
		const date = new Date(`${value}T00:00:00`);
		const year = date.getFullYear();
		const month = date.getMonth();
		const firstOffset = new Date(year, month, 1).getDay();
		const count = new Date(year, month + 1, 0).getDate();
		return [
			...Array.from({ length: firstOffset }, () => ''),
			...Array.from({ length: count }, (_, index) => `${year}-${String(month + 1).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`)
		];
	}

	function moveMonth(offset: number) {
		const date = new Date(`${cursor}T00:00:00`);
		date.setMonth(date.getMonth() + offset);
		cursor = monthStart(date.toISOString().slice(0, 10));
	}

	function choose(value: string) {
		if (choosing === 'from') {
			from = value;
			if (to && value > to) to = value;
			choosing = 'to';
			return;
		}
		to = value;
		if (from && value < from) from = value;
		open = false;
	}

	function clear() {
		from = '';
		to = '';
		choosing = 'from';
		open = false;
	}

	function rangeLabel(start: string, end: string) {
		if (start && end) return `${shortDate(start)} - ${shortDate(end)}`;
		if (start) return `From ${shortDate(start)}`;
		if (end) return `Until ${shortDate(end)}`;
		return 'Any date';
	}

	function shortDate(value: string) {
		return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	function monthLabel(value: string) {
		return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
	}
</script>

<div class="relative">
	<button class="inline-flex h-8 items-center gap-2 bg-[#141412] px-2.5 text-xs text-[#a09d94] hover:text-[#eae9e4]" onclick={() => (open = !open)}>
		<CalendarDays class="h-3.5 w-3.5" />
		{label}
	</button>
	{#if open}
		<div class="absolute right-0 z-20 mt-2 w-64 bg-[#141412] p-3 shadow-xl shadow-black/30">
			<div class="mb-3 flex items-center justify-between">
				<button class="p-1 text-[#8c887e] hover:text-[#eae9e4]" onclick={() => moveMonth(-1)} aria-label="Previous month">
					<ChevronLeft class="h-4 w-4" />
				</button>
				<div class="text-sm font-medium text-[#eae9e4]">{monthLabel(cursor)}</div>
				<button class="p-1 text-[#8c887e] hover:text-[#eae9e4]" onclick={() => moveMonth(1)} aria-label="Next month">
					<ChevronRight class="h-4 w-4" />
				</button>
			</div>
			<div class="mb-2 flex gap-1">
				<button class="flex-1 py-1 text-xs {choosing === 'from' ? 'bg-[#2a2a28] text-[#f0eee4]' : 'text-[#8c887e] hover:text-[#eae9e4]'}" onclick={() => (choosing = 'from')}>Start</button>
				<button class="flex-1 py-1 text-xs {choosing === 'to' ? 'bg-[#2a2a28] text-[#f0eee4]' : 'text-[#8c887e] hover:text-[#eae9e4]'}" onclick={() => (choosing = 'to')}>End</button>
			</div>
			<div class="grid grid-cols-7 gap-1 text-center text-[11px] text-[#6f6b5f]">
				{#each ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as day}
					<div class="py-1">{day}</div>
				{/each}
				{#each days as day}
					{#if day}
						<button
							class="h-7 text-xs {day === from || day === to ? 'bg-[#eae9e4] text-[#0f0f0d]' : day > from && day < to ? 'bg-[#24231f] text-[#eae9e4]' : 'text-[#a09d94] hover:bg-[#1f1f1c] hover:text-[#eae9e4]'}"
							onclick={() => choose(day)}
						>
							{Number(day.slice(8))}
						</button>
					{:else}
						<div></div>
					{/if}
				{/each}
			</div>
			<div class="mt-3 flex justify-between">
				<button class="inline-flex items-center gap-1 px-2 py-1 text-xs text-[#8c887e] hover:text-[#eae9e4]" onclick={clear}>
					<X class="h-3 w-3" /> Clear
				</button>
				<button class="px-2 py-1 text-xs text-[#eae9e4]" onclick={() => (open = false)}>Done</button>
			</div>
		</div>
	{/if}
</div>
