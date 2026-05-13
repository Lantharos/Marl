<script lang="ts">
	import { page } from '$app/stores';
	import { onDestroy } from 'svelte';
	import {
		isAbortError,
		listTenantLeavesPage,
		type Leaf
	} from '$lib/api';
	import { appData } from '$lib/appState';
	import InfiniteLoader from '$lib/components/InfiniteLoader.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import UserProfileLink from '$lib/components/UserProfileLink.svelte';
	import ChevronRight from 'lucide-svelte/icons/chevron-right';
	import Pin from 'lucide-svelte/icons/pin';
	import Plus from 'lucide-svelte/icons/plus';
	import Search from 'lucide-svelte/icons/search';
	import StickyNote from 'lucide-svelte/icons/sticky-note';

	const tenant = $derived($page.params.tenant as string);
	const chunkSize = 25;

	let leaves = $state.raw<Leaf[]>([]);
	let nextPage = $state<number | null>(null);
	let total = $state(0);
	let loading = $state(true);
	let loadingMore = $state(false);
	let error = $state('');
	let tenantNames = $state<string[]>([]);
	let searchInput = $state('');
	let searchQuery = $state('');
	let searchTimer: ReturnType<typeof setTimeout> | null = null;

	const canWrite = $derived(tenantNames.includes(tenant));
	const unsubscribe = appData.subscribe((value) => {
		tenantNames = value.me?.tenants.map((item) => item.name) ?? [];
	});

	onDestroy(unsubscribe);
	onDestroy(() => {
		if (searchTimer) clearTimeout(searchTimer);
	});

	$effect(() => {
		if (!tenant) return;
		const controller = new AbortController();
		void load(controller.signal, searchQuery);
		return () => controller.abort();
	});

	async function load(signal?: AbortSignal, query = '') {
		loading = true;
		error = '';
		try {
			const result = await listTenantLeavesPage(tenant, {
				page: 1,
				perPage: chunkSize,
				q: query || undefined,
				signal
			});
			leaves = result.items;
			total = result.total;
			nextPage = result.next;
		} catch (e) {
			if (isAbortError(e)) return;
			error = e instanceof Error ? e.message : 'Failed to load leaves';
		} finally {
			if (!signal?.aborted) loading = false;
		}
	}

	async function loadMore() {
		if (!nextPage || loadingMore) return;
		const requestTenant = tenant;
		const requestQuery = searchQuery;
		loadingMore = true;
		try {
			const result = await listTenantLeavesPage(requestTenant, {
				page: nextPage,
				perPage: chunkSize,
				q: requestQuery || undefined
			});
			if (requestTenant !== tenant || requestQuery !== searchQuery) return;
			const seen = new Set(leaves.map((leaf) => leaf.id));
			leaves = [...leaves, ...result.items.filter((leaf) => !seen.has(leaf.id))];
			total = result.total;
			nextPage = result.next;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load leaves';
		} finally {
			loadingMore = false;
		}
	}

	function updateSearch(value: string) {
		searchInput = value;
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			searchTimer = null;
			searchQuery = searchInput.trim();
		}, 180);
	}
</script>

<div class="mx-auto max-w-5xl">
	<div class="mb-6">
		<h1 class="text-2xl font-semibold text-[#f0eee4]">Leaves</h1>
		<p class="mt-1 text-sm text-[#8c887e]">{tenant} notes and snippets</p>
	</div>

	<div class="mb-5 flex flex-wrap items-center gap-3">
		<div class="flex h-9 min-w-64 flex-1 items-center gap-2 border border-[#2a2a28] bg-[#141412] px-2.5 focus-within:border-[#d9a66c]">
			<Search class="h-3.5 w-3.5 shrink-0 text-[#6f6b5f]" />
			<input
				class="leaf-search-input min-w-0 flex-1 border-0 bg-transparent text-sm text-[#eae9e4] outline-none ring-0 placeholder:text-[#6f6b5f]"
				placeholder="Search leaves"
				value={searchInput}
				oninput={(event) => updateSearch(event.currentTarget.value)}
			/>
		</div>
		{#if canWrite}
			<a class="inline-flex h-9 items-center gap-1 bg-[#eae9e4] px-3 text-sm text-[#0f0f0d] hover:bg-[#d8d3c5]" href={`/${tenant}/leaves/new`}>
				<Plus class="h-4 w-4" /> New leaf
			</a>
		{/if}
	</div>

	{#if error}
		<div class="mb-4 border border-[#4a2a24] bg-[#1a1110] px-3 py-2 text-sm text-[#d96c5a]">{error}</div>
	{/if}

	{#if loading}
		<Spinner />
	{:else}
		<div class="border border-[#2a2a28] bg-[#0f0f0d]">
			<div class="flex min-h-11 items-center justify-between border-b border-[#2a2a28] bg-[#141412] px-4 text-sm text-[#a09d94]">
				<div>All <span class="ml-1 text-xs text-[#6f6b5f]">{total}</span></div>
				<span>Updated</span>
			</div>
			{#each leaves as leaf (leaf.id)}
				<a class="group grid min-h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-[#252522] px-4 py-3 last:border-b-0 hover:bg-[#1a1a18]" href={leaf.href}>
					<div class="grid h-8 w-8 shrink-0 place-items-center bg-[#1e1e1c] text-[#d9a66c]">
						<StickyNote class="h-4 w-4" />
					</div>
					<div class="min-w-0">
						<div class="flex min-w-0 items-center gap-2">
							<span class="truncate text-sm font-medium text-[#eae9e4]">{leaf.title}</span>
							{#if leaf.pinned}<Pin class="h-3.5 w-3.5 shrink-0 text-[#d9a66c]" />{/if}
						</div>
						<div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#8c887e]">
							<span>{leaf.visibility}</span>
							<span>{leaf.attached_type}{leaf.attached_id ? `:${leaf.attached_id}` : ''}</span>
							<UserProfileLink user={leaf.author} profile={leaf.author_profile} />
							{#each leaf.tags.slice(0, 4) as tag (tag)}<span class="text-[#d9a66c]">#{tag}</span>{/each}
						</div>
					</div>
					<ChevronRight class="h-4 w-4 text-[#6f6b5f] group-hover:text-[#eae9e4]" />
				</a>
			{:else}
				<div class="px-4 py-10 text-center text-sm text-[#6f6b5f]">No leaves yet.</div>
			{/each}
		</div>
		<InfiniteLoader active={Boolean(nextPage)} onVisible={loadMore} />
	{/if}
</div>

<style>
	.leaf-search-input:focus,
	.leaf-search-input:focus-visible {
		outline: none !important;
		box-shadow: none !important;
	}
</style>
