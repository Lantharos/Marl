<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';
	import { onDestroy } from 'svelte';
	import { getProjectHistory, isAbortError, type HistoryEntry } from '$lib/api';
	import { appData } from '$lib/appState';
	import DateRangePicker from '$lib/components/DateRangePicker.svelte';
	import InfiniteLoader from '$lib/components/InfiniteLoader.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import { userDisplayName, userInitials, withoutOpaqueUserIds } from '$lib/identity';
	import ChevronRight from 'lucide-svelte/icons/chevron-right';

	const tenant = $derived($page.params.tenant as string);
	const project = $derived($page.params.project as string);
	const chunkSize = 20;

	let entries = $state<HistoryEntry[]>([]);
	let loading = $state(true);
	let error = $state('');
	let visibleCount = $state(chunkSize);
	let vigilantMode = $state(false);

	const unsubscribeAppData = appData.subscribe((value) => {
		vigilantMode = Boolean(value.me?.settings?.vigilant_mode);
	});

	onDestroy(unsubscribeAppData);

	async function load(signal: AbortSignal) {
		loading = true;
		error = '';
		try {
			entries = await getProjectHistory(tenant, project, { signal, limit: 500 });
		} catch (e) {
			if (isAbortError(e)) return;
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			if (!signal.aborted) loading = false;
		}
	}

	$effect(() => {
		if (!tenant || !project) return;
		const controller = new AbortController();
		load(controller.signal);
		return () => controller.abort();
	});

	function actionLabel(kind: HistoryEntry['kind']) {
		switch (kind) {
			case 'save':
				return 'saved';
			case 'ship':
				return 'shipped';
			case 'cram':
				return 'crammed';
			case 'merge':
				return 'merged';
			case 'ready':
				return 'marked ready';
			default:
				return kind;
		}
	}

	let dateFrom = $state('');
	let dateTo = $state('');
	const filtered = $derived(entries.filter((entry) => inDateRange(entry.timestamp)));
	const visibleEntries = $derived(filtered.slice(0, visibleCount));
	const hasMore = $derived(visibleEntries.length < filtered.length);
	const groupedEntries = $derived(groupByDay(visibleEntries));

	$effect(() => {
		dateFrom;
		dateTo;
		visibleCount = chunkSize;
	});

	function displayMessage(entry: HistoryEntry) {
		return withoutOpaqueUserIds(entry.message) || entry.kind;
	}

	function inDateRange(timestamp: string) {
		const date = timestamp.slice(0, 10);
		if (dateFrom && date < dateFrom) return false;
		if (dateTo && date > dateTo) return false;
		return true;
	}

	function dayKey(timestamp: string) {
		const date = new Date(timestamp);
		return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
	}

	function dayLabel(timestamp: string) {
		const date = new Date(timestamp);
		const today = new Date();
		const yesterday = new Date();
		yesterday.setDate(today.getDate() - 1);
		if (dayKey(timestamp) === dayKey(today.toISOString())) return 'Today';
		if (dayKey(timestamp) === dayKey(yesterday.toISOString())) return 'Yesterday';
		return date.toLocaleDateString(undefined, {
			weekday: 'long',
			month: 'short',
			day: 'numeric',
			year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric'
		});
	}

	function groupByDay(items: HistoryEntry[]) {
		const groups: { key: string; label: string; entries: HistoryEntry[] }[] = [];
		for (const entry of items) {
			const key = dayKey(entry.timestamp);
			let group = groups[groups.length - 1];
			if (!group || group.key !== key) {
				group = { key, label: dayLabel(entry.timestamp), entries: [] };
				groups.push(group);
			}
			group.entries.push(entry);
		}
		return groups;
	}

	function loadMore() {
		visibleCount = Math.min(visibleCount + chunkSize, filtered.length);
	}

</script>

<div class="mx-auto max-w-6xl">
	<div class="mb-5 flex flex-wrap items-center justify-between gap-3">
		<h3 class="text-sm font-semibold text-[#f0eee4]">History</h3>
		{#if !loading && !error}
			<DateRangePicker bind:from={dateFrom} bind:to={dateTo} />
		{/if}
	</div>

	{#if loading}
		<Spinner />
	{:else if error}
		<div class="text-sm text-[#d96c5a]">{error}</div>
	{:else}
		{#if filtered.length}
			<div class="grid gap-7">
				{#each groupedEntries as group (group.key)}
					<section>
						<div class="mb-2 text-xs font-medium text-[#8c887e]">{group.label}</div>
						<div class="grid overflow-hidden rounded border border-[#2a2a28] bg-[#141412]">
							{#each group.entries as entry (entry.id)}
								<a
									href={resolve('/[tenant]/[project]/history/[entryId]', {
										tenant,
										project,
										entryId: entry.id
									})}
									class="group flex w-full items-start gap-3 border-b border-[#252522] px-4 py-3 text-left last:border-b-0 hover:bg-[#1a1a18]"
								>
									<div class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#2a2a28] text-[10px] font-medium text-[#eae9e4]">
										{#if entry.author_profile?.avatar_url}
											<img src={entry.author_profile.avatar_url} alt="" class="h-full w-full object-cover" />
										{:else}
											{userInitials(entry.author, entry.author_profile)}
										{/if}
									</div>
									<div class="min-w-0 flex-1">
										<div class="flex flex-wrap items-center gap-2">
											<span class="text-sm font-medium text-[#eae9e4]">{displayMessage(entry)}</span>
											<span class="text-xs text-[#6f6b5f]">{actionLabel(entry.kind)}</span>
											{#if entry.agent}
												<span class="rounded bg-[#1e1e1c] px-1.5 py-0.5 text-[10px] text-[#a09d94]">{entry.agent}{entry.model ? ` ${entry.model}` : ''}</span>
											{/if}
											{#if entry.signature}
												<span class="rounded border border-[#25462a] bg-[#142018] px-1.5 py-0.5 text-[10px] text-[#7cb97c]">signed</span>
											{:else if vigilantMode && entry.snapshot_id}
												<span class="rounded border border-[#2a2a28] bg-[#10100e] px-1.5 py-0.5 text-[10px] text-[#6f6b5f]">unsigned</span>
											{/if}
										</div>
										<div class="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[#6f6b5f]">
											<span>{userDisplayName(entry.author, entry.author_profile)}</span>
											<span>{new Date(entry.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
											{#if entry.snapshot_id}
												<span class="font-mono text-[10px]">{entry.snapshot_id.slice(0, 8)}</span>
											{/if}
										</div>
									</div>
									<ChevronRight class="mt-1 h-4 w-4 shrink-0 text-[#6f6b5f] group-hover:text-[#eae9e4]" />
								</a>
							{/each}
						</div>
					</section>
				{/each}
			</div>
			<InfiniteLoader active={hasMore} onVisible={loadMore} />
		{:else}
			<p class="py-8 text-center text-sm text-[#6f6b5f]">No history yet.</p>
		{/if}
	{/if}
</div>
