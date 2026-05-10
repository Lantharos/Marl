<script lang="ts">
	import { page } from '$app/stores';
	import { onDestroy } from 'svelte';
	import {
		deleteProjectScreenshot,
		featureProjectScreenshot,
		isAbortError,
		listProjectScreenshots,
		uploadProjectScreenshot,
		type ProjectScreenshot
	} from '$lib/api';
	import InfiniteLoader from '$lib/components/InfiniteLoader.svelte';
	import ScreenshotImage from '$lib/components/ScreenshotImage.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import { currentProjectAccess } from '$lib/projectAccessStore';
	import Check from 'lucide-svelte/icons/check';
	import Star from 'lucide-svelte/icons/star';
	import Trash2 from 'lucide-svelte/icons/trash-2';
	import Upload from 'lucide-svelte/icons/upload';

	const tenant = $derived($page.params.tenant as string);
	const project = $derived($page.params.project as string);
	const pageSize = 18;

	let screenshots = $state.raw<ProjectScreenshot[]>([]);
	let nextPage = $state<number | null>(null);
	let loading = $state(true);
	let loadingMore = $state(false);
	let uploading = $state(false);
	let error = $state('');
	let dragActive = $state(false);
	let canManage = $state(false);
	let fileInput = $state<HTMLInputElement | null>(null);
	let pendingDelete = $state('');

	const unsubscribe = currentProjectAccess.subscribe((value) => {
		canManage = Boolean(value?.can_maintain && !value?.archived);
	});

	onDestroy(unsubscribe);

	$effect(() => {
		if (!tenant || !project) return;
		const controller = new AbortController();
		void load(controller.signal);
		return () => controller.abort();
	});

	async function load(signal?: AbortSignal) {
		loading = true;
		error = '';
		loadingMore = false;
		try {
			const result = await listProjectScreenshots(tenant, project, {
				page: 1,
				perPage: pageSize,
				signal
			});
			screenshots = result.items;
			nextPage = result.next;
		} catch (value) {
			if (isAbortError(value)) return;
			error = value instanceof Error ? value.message : 'Failed to load screenshots';
		} finally {
			if (!signal?.aborted) loading = false;
		}
	}

	async function loadMore() {
		if (!nextPage || loadingMore) return;
		const requestTenant = tenant;
		const requestProject = project;
		loadingMore = true;
		try {
			const result = await listProjectScreenshots(requestTenant, requestProject, {
				page: nextPage,
				perPage: pageSize
			});
			if (requestTenant !== tenant || requestProject !== project) return;
			screenshots = appendUnique(screenshots, result.items);
			nextPage = result.next;
		} catch (value) {
			error = value instanceof Error ? value.message : 'Failed to load screenshots';
		} finally {
			loadingMore = false;
		}
	}

	function appendUnique(current: ProjectScreenshot[], incoming: ProjectScreenshot[]) {
		const seen = current.map((item) => item.id);
		return [...current, ...incoming.filter((item) => {
			if (seen.includes(item.id)) return false;
			seen.push(item.id);
			return true;
		})];
	}

	async function chooseFiles(files: FileList | File[]) {
		const images = [...files].filter((file) => file.type.startsWith('image/'));
		if (!images.length) return;
		uploading = true;
		error = '';
		try {
			for (const file of images) {
				const item = await uploadProjectScreenshot(tenant, project, file);
				mergeScreenshot(item);
			}
		} catch (value) {
			error = value instanceof Error ? value.message : 'Upload failed';
		} finally {
			uploading = false;
			if (fileInput) fileInput.value = '';
		}
	}

	function mergeScreenshot(item: ProjectScreenshot) {
		const next = screenshots.filter((current) => current.id !== item.id);
		if (item.featured) {
			for (const current of next) current.featured = false;
		}
		screenshots = [item, ...next].sort(sortScreenshots);
	}

	function sortScreenshots(left: ProjectScreenshot, right: ProjectScreenshot) {
		if (Boolean(left.featured) !== Boolean(right.featured)) return left.featured ? -1 : 1;
		return Date.parse(right.created_at ?? right.uploaded_at ?? '') - Date.parse(left.created_at ?? left.uploaded_at ?? '');
	}

	async function markFeatured(item: ProjectScreenshot) {
		if (item.featured) return;
		try {
			const updated = await featureProjectScreenshot(tenant, project, item.id);
			screenshots = screenshots.map((current) => ({
				...current,
				featured: current.id === updated.id
			})).sort(sortScreenshots);
		} catch (value) {
			error = value instanceof Error ? value.message : 'Failed to feature screenshot';
		}
	}

	async function removeScreenshot(item: ProjectScreenshot) {
		if (pendingDelete !== item.id) {
			pendingDelete = item.id;
			return;
		}
		try {
			await deleteProjectScreenshot(tenant, project, item.id);
			screenshots = screenshots.filter((current) => current.id !== item.id);
			pendingDelete = '';
		} catch (value) {
			error = value instanceof Error ? value.message : 'Failed to delete screenshot';
		}
	}

	function uploadDate(item: ProjectScreenshot) {
		const value = item.uploaded_at ?? item.created_at;
		if (!value) return '';
		const date = new Date(value);
		if (Number.isNaN(date.valueOf())) return '';
		return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function onDrop(event: DragEvent) {
		event.preventDefault();
		dragActive = false;
		if (!canManage || !event.dataTransfer?.files.length) return;
		void chooseFiles(event.dataTransfer.files);
	}
</script>

<div class="mx-auto max-w-6xl">
	{#if error}
		<div class="mb-4 border border-[#4a2a24] bg-[#1a1110] px-3 py-2 text-sm text-[#d96c5a]">{error}</div>
	{/if}

	{#if canManage}
		<input
			bind:this={fileInput}
			class="sr-only"
			type="file"
			accept="image/png,image/jpeg,image/gif,image/webp"
			multiple
			onchange={(event) => event.currentTarget.files && void chooseFiles(event.currentTarget.files)}
		/>
		<button
			type="button"
			class="mb-5 grid min-h-28 w-full place-items-center border border-dashed px-4 text-sm transition {dragActive ? 'border-[#d9a66c] bg-[#181612] text-[#eae9e4]' : 'border-[#2a2a28] bg-[#141412] text-[#8c887e] hover:border-[#3a3a36] hover:text-[#eae9e4]'}"
			ondragenter={(event) => {
				event.preventDefault();
				dragActive = true;
			}}
			ondragover={(event) => event.preventDefault()}
			ondragleave={() => (dragActive = false)}
			ondrop={onDrop}
			onclick={() => fileInput?.click()}
		>
			<span class="flex items-center gap-2">
				<Upload class="h-4 w-4 {uploading ? 'animate-pulse' : ''}" />
				{uploading ? 'Uploading' : 'Drop images here or choose files'}
			</span>
		</button>
	{/if}

	{#if loading}
		<Spinner />
	{:else if screenshots.length}
		<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
			{#each screenshots as item (item.id)}
				<article class="group border border-[#2a2a28] bg-[#141412]">
					<ScreenshotImage src={item.download_url} alt={item.title ?? item.name} class="aspect-[16/10]" />
					<div class="border-t border-[#2a2a28] p-3">
						<div class="flex min-w-0 items-start justify-between gap-3">
							<div class="min-w-0">
								<div class="truncate text-sm text-[#eae9e4]">{item.title || item.name}</div>
								<div class="mt-1 truncate text-xs text-[#6f6b5f]">{uploadDate(item)}{item.uploaded_by ? ` by ${item.uploaded_by}` : ''}</div>
							</div>
							{#if item.featured}
								<span class="inline-flex shrink-0 items-center gap-1 text-xs text-[#d9a66c]"><Star class="h-3.5 w-3.5 fill-current" /> Featured</span>
							{/if}
						</div>
						{#if canManage}
							<div class="mt-3 flex items-center gap-2">
								<button class="inline-flex h-8 items-center gap-1 border border-[#2a2a28] px-2.5 text-xs text-[#eae9e4] hover:bg-[#1e1e1c] disabled:text-[#6f6b5f]" disabled={item.featured} onclick={() => void markFeatured(item)}>
									<Check class="h-3.5 w-3.5" /> {item.featured ? 'Featured' : 'Feature'}
								</button>
								<button class="inline-flex h-8 items-center gap-1 border border-[#2a2a28] px-2.5 text-xs text-[#d96c5a] hover:bg-[#1e1e1c]" onclick={() => void removeScreenshot(item)}>
									<Trash2 class="h-3.5 w-3.5" /> {pendingDelete === item.id ? 'Confirm delete' : 'Delete'}
								</button>
							</div>
						{/if}
					</div>
				</article>
			{/each}
		</div>
		<InfiniteLoader active={Boolean(nextPage)} onVisible={loadMore} />
	{:else}
		<div class="border border-[#2a2a28] bg-[#141412] px-4 py-10 text-center text-sm text-[#8c887e]">
			{canManage ? 'No gallery images yet.' : 'No gallery images.'}
		</div>
	{/if}
</div>
