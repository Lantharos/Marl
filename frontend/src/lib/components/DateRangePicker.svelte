<script lang="ts">
	import { dateRangeSuggestions, formatCanonicalRange, formatDateRangeLabel, parseNaturalDateRange } from '$lib/dateRange';
	import CalendarDays from 'lucide-svelte/icons/calendar-days';
	import Check from 'lucide-svelte/icons/check';
	import X from 'lucide-svelte/icons/x';

	let { from = $bindable(''), to = $bindable(''), placeholder = 'Any date' } = $props();

	let root = $state<HTMLDivElement | null>(null);
	let open = $state(false);
	let draft = $state('');

	const label = $derived(formatDateRangeLabel(from, to));
	const parsed = $derived(parseNaturalDateRange(draft));
	const preview = $derived(parsed ? formatDateRangeLabel(parsed.from, parsed.to) : '');
	const active = $derived(Boolean(from || to));

	function toggle() {
		open = !open;
		if (open) draft = formatCanonicalRange(from, to);
	}

	function apply(value = draft) {
		const next = parseNaturalDateRange(value);
		if (!next) return;
		from = next.from;
		to = next.to;
		draft = formatCanonicalRange(from, to);
		open = false;
	}

	function clear() {
		from = '';
		to = '';
		draft = '';
		open = false;
	}

	function handleOutside(event: PointerEvent) {
		if (!open || !root) return;
		if (!root.contains(event.target as Node)) open = false;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			apply();
		}
		if (event.key === 'Escape') open = false;
	}
</script>

<svelte:document onpointerdown={handleOutside} />

<div bind:this={root} class="relative">
	<button
		class="inline-flex h-9 min-w-36 items-center gap-2 border border-[#2a2a28] bg-[#141412] px-2.5 text-xs hover:border-[#3a3a36] {active ? 'text-[#d9a66c]' : 'text-[#a09d94] hover:text-[#eae9e4]'}"
		type="button"
		onclick={toggle}
	>
		<CalendarDays class="h-3.5 w-3.5 shrink-0" />
		<span class="truncate">{active ? label : placeholder}</span>
	</button>

	{#if open}
		<div class="absolute right-0 z-30 mt-2 w-80 border border-[#2a2a28] bg-[#141412] shadow-xl shadow-black/30">
			<div class="border-b border-[#252522] p-3">
				<div class="flex h-9 items-center gap-2 border border-[#2a2a28] bg-[#0f0f0d] px-2.5 focus-within:border-[#d9a66c]">
					<CalendarDays class="h-3.5 w-3.5 shrink-0 text-[#6f6b5f]" />
					<input
						class="date-range-input min-w-0 flex-1 border-0 bg-transparent text-sm text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus:border-0 focus:outline-none focus-visible:outline-none"
						placeholder="last 7 days, may 1 to may 10"
						bind:value={draft}
						onkeydown={handleKeydown}
					/>
				</div>
				<div class="mt-2 min-h-4 text-xs {parsed ? 'text-[#8c887e]' : draft.trim() ? 'text-[#d96c5a]' : 'text-[#6f6b5f]'}">
					{#if draft.trim()}
						{parsed ? preview : 'No date match'}
					{:else}
						Type a date or range
					{/if}
				</div>
			</div>

			<div class="grid gap-1 p-2">
				{#each dateRangeSuggestions as suggestion (suggestion)}
					<button class="flex items-center justify-between px-2 py-1.5 text-left text-sm text-[#a09d94] hover:bg-[#1e1e1c] hover:text-[#eae9e4]" type="button" onclick={() => apply(suggestion)}>
						<span>{suggestion}</span>
						<span class="text-xs text-[#6f6b5f]">{formatDateRangeLabel(parseNaturalDateRange(suggestion)?.from ?? '', parseNaturalDateRange(suggestion)?.to ?? '')}</span>
					</button>
				{/each}
			</div>

			<div class="flex items-center justify-between border-t border-[#252522] px-3 py-2">
				<button class="inline-flex h-8 items-center gap-1.5 px-2 text-xs text-[#8c887e] hover:text-[#eae9e4]" type="button" onclick={clear}>
					<X class="h-3.5 w-3.5" /> Clear
				</button>
				<button class="inline-flex h-8 items-center gap-1.5 bg-[#eae9e4] px-3 text-xs font-medium text-[#0f0f0d] disabled:opacity-50" type="button" disabled={!parsed} onclick={() => apply()}>
					<Check class="h-3.5 w-3.5" /> Apply
				</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.date-range-input:focus,
	.date-range-input:focus-visible {
		outline: none;
	}
</style>
