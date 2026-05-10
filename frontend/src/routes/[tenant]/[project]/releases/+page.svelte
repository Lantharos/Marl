<script lang="ts">
	import { page } from '$app/stores';
	import { onDestroy } from 'svelte';
	import {
		deleteRelease,
		isAbortError,
		listReleasesPage,
		listTags,
		type Release,
		type TagInfo
	} from '$lib/api';
	import DateRangePicker from '$lib/components/DateRangePicker.svelte';
	import InfiniteLoader from '$lib/components/InfiniteLoader.svelte';
	import ReleaseListItem from '$lib/components/ReleaseListItem.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import { dateInRange } from '$lib/dateRange';
	import { currentProjectAccess } from '$lib/projectAccessStore';
	import GitCommit from 'lucide-svelte/icons/git-commit';
	import Plus from 'lucide-svelte/icons/plus';
	import Search from 'lucide-svelte/icons/search';
	import Tag from 'lucide-svelte/icons/tag';

	const tenant = $derived($page.params.tenant as string);
	const project = $derived($page.params.project as string);
	const chunkSize = 20;

	let releaseItems = $state.raw<Release[]>([]);
	let tags = $state.raw<TagInfo[]>([]);
	let releaseNext = $state<number | null>(null);
	let tagNext = $state<number | null>(null);
	let releaseTotal = $state(0);
	let tagTotal = $state(0);
	let releaseLoadingMore = $state(false);
	let tagLoadingMore = $state(false);
	let loading = $state(true);
	let error = $state('');
	let canMutate = $state(false);
	let tab = $state<'releases' | 'tags'>('releases');
	let searchInput = $state('');
	let searchQuery = $state('');
	let dateFrom = $state('');
	let dateTo = $state('');
	let searchTimer: ReturnType<typeof setTimeout> | null = null;

	const unsubscribe = currentProjectAccess.subscribe((value) => {
		canMutate = Boolean(value?.can_maintain && !value?.archived);
	});

	onDestroy(unsubscribe);
	onDestroy(() => {
		if (searchTimer) clearTimeout(searchTimer);
	});

	const releaseByTag = $derived.by(() => new Map(releaseItems.map((release) => [release.tag, release])));
	const searchPlaceholder = $derived(tab === 'tags' ? 'Search tags' : 'Search releases');
	const hasFilter = $derived(Boolean(searchQuery.trim() || dateFrom || dateTo));
	const filteredReleases = $derived(releaseItems.filter((release) => dateInRange(release.created_at ?? release.updated_at, dateFrom, dateTo)));
	const filteredTags = $derived(tags.filter((tag) => dateInRange(tag.created_at, dateFrom, dateTo)));

	$effect(() => {
		if (!tenant || !project) return;
		const controller = new AbortController();
		load(controller.signal, searchQuery);
		return () => controller.abort();
	});

	async function load(signal?: AbortSignal, query = '') {
		loading = true;
		error = '';
		releaseLoadingMore = false;
		tagLoadingMore = false;
		try {
			const pageOptions = { page: 1, perPage: chunkSize, q: query || undefined, signal };
			const [releaseResult, tagResult] = await Promise.all([
				listReleasesPage(tenant, project, pageOptions),
				listTags(tenant, project, pageOptions).catch(() => null)
			]);
			releaseItems = releaseResult.items;
			tags = tagResult?.items ?? [];
			releaseTotal = releaseResult.total;
			tagTotal = tagResult?.total ?? 0;
			releaseNext = releaseResult.next;
			tagNext = tagResult?.next ?? null;
		} catch (e) {
			if (isAbortError(e)) return;
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			if (!signal?.aborted) loading = false;
		}
	}

	function formatDate(value: string | null | undefined) {
		if (!value) return '';
		const date = new Date(value);
		if (Number.isNaN(date.valueOf())) return '';
		return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function updateSearch(value: string) {
		searchInput = value;
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			searchTimer = null;
			searchQuery = searchInput.trim();
		}, 180);
	}

	async function loadMoreReleases() {
		if (!releaseNext || releaseLoadingMore) return;
		const requestTenant = tenant;
		const requestProject = project;
		const requestQuery = searchQuery;
		releaseLoadingMore = true;
		try {
			const result = await listReleasesPage(requestTenant, requestProject, {
				page: releaseNext,
				perPage: chunkSize,
				q: requestQuery || undefined
			});
			if (requestTenant !== tenant || requestProject !== project || requestQuery !== searchQuery) return;
			releaseItems = appendUnique(releaseItems, result.items, releaseKey);
			releaseTotal = result.total;
			releaseNext = result.next;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			releaseLoadingMore = false;
		}
	}

	async function loadMoreTags() {
		if (!tagNext || tagLoadingMore) return;
		const requestTenant = tenant;
		const requestProject = project;
		const requestQuery = searchQuery;
		tagLoadingMore = true;
		try {
			const result = await listTags(requestTenant, requestProject, {
				page: tagNext,
				perPage: chunkSize,
				q: requestQuery || undefined
			});
			if (requestTenant !== tenant || requestProject !== project || requestQuery !== searchQuery) return;
			tags = appendUnique(tags, result.items, tagKey);
			tagTotal = result.total;
			tagNext = result.next;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			tagLoadingMore = false;
		}
	}

	function appendUnique<T>(current: T[], incoming: T[], keyFor: (item: T) => string) {
		const seen = new Set(current.map(keyFor));
		return [...current, ...incoming.filter((item) => {
			const key = keyFor(item);
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		})];
	}

	function releaseKey(release: Release) {
		return release.id ?? release.tag;
	}

	function tagKey(tag: TagInfo) {
		return tag.id ?? tag.tag ?? tag.name ?? '';
	}

	async function handleDeleteRelease(release: Release) {
		const id = release.id ?? release.tag;
		await deleteRelease(tenant, project, id);
		releaseItems = releaseItems.filter((item) => (item.id ?? item.tag) !== id);
		releaseTotal = Math.max(0, releaseTotal - 1);
	}
</script>

<div class="mx-auto max-w-6xl">
	<div class="mb-5 flex flex-wrap items-center gap-3">
		<div class="flex h-9 min-w-64 flex-1 items-center gap-2 border border-[#2a2a28] bg-[#141412] px-2.5 focus-within:border-[#d9a66c]">
			<Search class="h-3.5 w-3.5 shrink-0 text-[#6f6b5f]" />
			<input
				class="release-search-input min-w-0 flex-1 border-0 bg-transparent text-sm text-[#eae9e4] outline-none ring-0 placeholder:text-[#6f6b5f] focus:border-0 focus:outline-none focus:ring-0 focus-visible:outline-none"
				placeholder={searchPlaceholder}
				value={searchInput}
				oninput={(event) => updateSearch(event.currentTarget.value)}
			/>
		</div>
		<DateRangePicker bind:from={dateFrom} bind:to={dateTo} placeholder="Any release date" />
		{#if canMutate}
			<a class="inline-flex h-9 shrink-0 items-center gap-1 bg-[#eae9e4] px-3 text-sm text-[#0f0f0d] hover:bg-[#d8d3c5]" href={`/${tenant}/${project}/releases/new`}>
				<Plus class="h-4 w-4" /> New release
			</a>
		{/if}
	</div>

	<div class="mb-4 border border-[#2a2a28] bg-[#0f0f0d]">
		<div class="flex flex-wrap items-center justify-between gap-3 border-b border-[#2a2a28] bg-[#141412] px-4 py-3">
			<div class="flex items-center gap-4 text-sm">
				<button class="{tab === 'releases' ? 'text-[#f0eee4]' : 'text-[#8c887e] hover:text-[#eae9e4]'}" type="button" onclick={() => (tab = 'releases')}>
					Releases <span class="ml-1 text-xs text-[#6f6b5f]">{releaseTotal}</span>
				</button>
				<button class="{tab === 'tags' ? 'text-[#f0eee4]' : 'text-[#8c887e] hover:text-[#eae9e4]'}" type="button" onclick={() => (tab = 'tags')}>
					Tags <span class="ml-1 text-xs text-[#6f6b5f]">{tagTotal}</span>
				</button>
			</div>
			<div class="text-sm text-[#8c887e]">Newest</div>
		</div>
	</div>

	{#if loading}
		<Spinner />
	{:else if error}
		<div class="border border-[#2a2a28] bg-[#141412] p-4 text-sm text-[#d96c5a]">{error}</div>
	{:else if tab === 'releases'}
		<div class="grid gap-4">
			{#each filteredReleases as release (release.id ?? release.tag)}
				<ReleaseListItem {release} {tenant} {project} canMutate={canMutate} onDelete={handleDeleteRelease} />
			{:else}
				<div class="border border-[#2a2a28] bg-[#141412] p-8 text-center">
					<p class="text-sm text-[#8c887e]">{hasFilter ? 'No releases match your filters.' : 'No releases yet.'}</p>
				</div>
			{/each}
		</div>
		<InfiniteLoader active={Boolean(releaseNext)} onVisible={loadMoreReleases} />
	{:else}
		<div class="border border-[#2a2a28] bg-[#141412]">
			<div class="flex min-h-12 items-center justify-between border-b border-[#252522] px-4">
				<div class="text-sm font-medium text-[#eae9e4]">{tagTotal} tags</div>
			</div>
			{#each filteredTags as item (item.id ?? item.tag ?? item.name)}
				{@const tagName = item.tag ?? item.name ?? item.id ?? ''}
				{@const release = releaseByTag.get(tagName)}
				<div class="grid gap-3 border-b border-[#252522] px-4 py-3 last:border-b-0 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
					<div class="flex min-w-0 items-start gap-3">
						<div class="mt-0.5 grid h-7 w-7 shrink-0 place-items-center bg-[#1e1e1c] text-[#d9a66c]">
							<Tag class="h-3.5 w-3.5" />
						</div>
						<div class="min-w-0">
							<div class="flex flex-wrap items-baseline gap-2">
								<div class="truncate font-mono text-sm text-[#eae9e4]">{tagName}</div>
								{#if release}
									<span class="text-xs text-[#7cb97c]">Release</span>
								{:else}
									<span class="text-xs text-[#6f6b5f]">Tag only</span>
								{/if}
							</div>
							<div class="mt-1 flex flex-wrap gap-2 text-xs text-[#6f6b5f]">
								{#if item.created_at}
									<span>{formatDate(item.created_at)}</span>
								{/if}
								{#if item.snapshot}
									<span class="inline-flex min-w-0 items-center gap-1 font-mono">
										<GitCommit class="h-3 w-3 shrink-0" />
										<span class="truncate">{item.snapshot.slice(0, 12)}</span>
									</span>
								{/if}
							</div>
						</div>
					</div>
					{#if release}
						<button class="h-8 border border-[#2a2a28] px-3 text-xs text-[#a09d94] hover:bg-[#1e1e1c] hover:text-[#eae9e4]" type="button" onclick={() => (tab = 'releases')}>
							View release
						</button>
					{/if}
				</div>
			{:else}
				<div class="p-8 text-center text-sm text-[#8c887e]">{hasFilter ? 'No tags match your filters.' : 'No tags yet.'}</div>
			{/each}
		</div>
		<InfiniteLoader active={Boolean(tagNext)} onVisible={loadMoreTags} />
	{/if}
</div>

<style>
	.release-search-input:focus,
	.release-search-input:focus-visible {
		outline: none;
	}
</style>
