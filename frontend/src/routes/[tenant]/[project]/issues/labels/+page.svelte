<script lang="ts">
	import { page } from '$app/stores';
	import { onDestroy, onMount } from 'svelte';
	import { createLabel, isAbortError, listIssuesPage, listLabelsPage, type Issue, type Label } from '$lib/api';
	import InfiniteLoader from '$lib/components/InfiniteLoader.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import { currentProjectAccess } from '$lib/projectAccessStore';
	import Plus from 'lucide-svelte/icons/plus';
	import Search from 'lucide-svelte/icons/search';
	import X from 'lucide-svelte/icons/x';

	const tenant = $derived($page.params.tenant as string);
	const project = $derived($page.params.project as string);
	const chunkSize = 30;

	let labels = $state<Label[]>([]);
	let issues = $state<Issue[]>([]);
	let query = $state('');
	let visible = $state(chunkSize);
	let loading = $state(true);
	let error = $state('');
	let canMaintain = $state(false);
	let modalOpen = $state(false);
	let busy = $state(false);
	let labelName = $state('');
	let labelDescription = $state('');
	let labelColor = $state('d9a66c');

	const unsubscribe = currentProjectAccess.subscribe((value) => {
		canMaintain = Boolean(value?.can_maintain && !value?.archived);
	});

	onDestroy(unsubscribe);

	const filteredLabels = $derived(labels.filter((label) => `${label.name} ${label.description ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())));
	const shownLabels = $derived(filteredLabels.slice(0, visible));

	$effect(() => {
		query;
		visible = chunkSize;
	});

	onMount(() => {
		const controller = new AbortController();
		load(controller.signal);
		return () => controller.abort();
	});

	async function load(signal?: AbortSignal) {
		loading = true;
		error = '';
		try {
			const [labelPage, issuePage] = await Promise.all([
				listLabelsPage(tenant, project, { page: 1, perPage: 500, signal }),
				listIssuesPage(tenant, project, { page: 1, perPage: 500, state: 'all', signal }).catch(() => null)
			]);
			labels = labelPage.items;
			issues = issuePage?.items ?? [];
		} catch (e) {
			if (isAbortError(e)) return;
			error = e instanceof Error ? e.message : 'Failed to load labels';
		} finally {
			if (!signal?.aborted) loading = false;
		}
	}

	async function submit() {
		if (!labelName.trim() || busy) return;
		busy = true;
		error = '';
		try {
			const label = await createLabel(tenant, project, {
				name: labelName.trim(),
				color: normalizedColor(labelColor),
				description: labelDescription.trim() || null
			});
			labels = [...labels, label].sort((a, b) => a.name.localeCompare(b.name));
			closeModal();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to create label';
		} finally {
			busy = false;
		}
	}

	function issueCount(name: string) {
		return issues.filter((issue) => issue.labels.includes(name)).length;
	}

	function color(value: string) {
		return `#${normalizedColor(value)}`;
	}

	function normalizedColor(value: string) {
		return value.trim().replace(/^#/, '') || 'd9a66c';
	}

	function closeModal() {
		modalOpen = false;
		labelName = '';
		labelDescription = '';
		labelColor = 'd9a66c';
	}
</script>

<div class="mx-auto max-w-6xl">
	<div class="mb-5 flex items-center justify-between gap-4">
		<h1 class="text-xl font-semibold text-[#f0eee4]">Labels</h1>
		{#if canMaintain}
			<button class="inline-flex h-9 items-center gap-1 bg-[#eae9e4] px-3 text-sm font-medium text-[#0f0f0d] hover:bg-[#d8d3c5]" onclick={() => (modalOpen = true)}><Plus class="h-4 w-4" /> New label</button>
		{/if}
	</div>

	<div class="mb-4 flex h-9 items-center gap-2 border border-[#2a2a28] bg-[#141412] px-2.5 focus-within:border-[#d9a66c]">
		<Search class="h-3.5 w-3.5 text-[#6f6b5f]" />
		<input class="label-input min-w-0 flex-1 border-0 bg-transparent text-sm text-[#eae9e4] placeholder:text-[#6f6b5f]" placeholder="Search all labels" bind:value={query} />
	</div>

	{#if error}
		<div class="mb-4 border border-[#4a2a24] bg-[#1a1110] px-3 py-2 text-sm text-[#d96c5a]">{error}</div>
	{/if}

	{#if loading}
		<Spinner />
	{:else}
		<div class="border border-[#2a2a28] bg-[#0f0f0d]">
			<div class="flex items-center justify-between border-b border-[#2a2a28] bg-[#141412] px-4 py-3 text-sm">
				<div class="font-medium text-[#eae9e4]">{filteredLabels.length} {filteredLabels.length === 1 ? 'label' : 'labels'}</div>
				<button class="text-[#8c887e] hover:text-[#eae9e4]">Sort</button>
			</div>
			<div class="divide-y divide-[#252522]">
				{#each shownLabels as label (label.name)}
					<a class="grid gap-2 px-4 py-3 hover:bg-[#141412] md:grid-cols-[260px_1fr_96px]" href="/{tenant}/{project}/issues?label={encodeURIComponent(label.name)}">
						<div class="min-w-0">
							<span class="inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-xs font-medium" style:background-color={color(label.color)} style:border-color={color(label.color)}>
								<span class="truncate text-[#0f0f0d]">{label.name}</span>
							</span>
						</div>
						<div class="min-w-0 truncate text-sm text-[#8c887e]">{label.description ?? ''}</div>
						<div class="text-right text-sm text-[#8c887e]">{issueCount(label.name)}</div>
					</a>
				{:else}
					<div class="p-10 text-center text-sm text-[#8c887e]">{query.trim() ? 'No matching labels.' : 'No labels yet.'}</div>
				{/each}
			</div>
		</div>
		<InfiniteLoader active={shownLabels.length < filteredLabels.length} onVisible={() => (visible = Math.min(visible + chunkSize, filteredLabels.length))} />
	{/if}
</div>

{#if modalOpen}
	<button class="fixed inset-0 z-40 cursor-default bg-[#0f0f0d]/70" aria-label="Close label dialog" onclick={closeModal}></button>
	<div class="fixed left-1/2 top-1/2 z-50 w-[min(480px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded border border-[#2a2a28] bg-[#141412] shadow-lg">
		<div class="flex items-center justify-between border-b border-[#2a2a28] px-4 py-3">
			<div class="text-sm font-medium text-[#eae9e4]">New label</div>
			<button class="text-[#8c887e] hover:text-[#eae9e4]" aria-label="Close" onclick={closeModal}><X class="h-4 w-4" /></button>
		</div>
		<form class="grid gap-4 p-4" onsubmit={(event) => { event.preventDefault(); submit(); }}>
			<div class="flex justify-center py-2">
				<span class="rounded-full px-2 py-0.5 text-xs font-medium text-[#0f0f0d]" style:background-color={color(labelColor)}>{labelName.trim() || 'Label preview'}</span>
			</div>
			<label class="grid gap-2 text-sm font-medium text-[#eae9e4]">
				Name
				<input class="label-input border border-[#2a2a28] bg-[#0f0f0d] px-3 py-2 text-sm font-normal text-[#eae9e4] placeholder:text-[#6f6b5f] focus:border-[#d9a66c]" placeholder="Label name" bind:value={labelName} />
			</label>
			<label class="grid gap-2 text-sm font-medium text-[#eae9e4]">
				Description
				<textarea class="label-input min-h-20 resize-y border border-[#2a2a28] bg-[#0f0f0d] px-3 py-2 text-sm font-normal text-[#eae9e4] placeholder:text-[#6f6b5f] focus:border-[#d9a66c]" placeholder="Optionally add a description" bind:value={labelDescription}></textarea>
			</label>
			<label class="grid gap-2 text-sm font-medium text-[#eae9e4]">
				Color
				<div class="flex gap-2">
					<span class="h-9 w-9 shrink-0 border border-[#2a2a28]" style:background-color={color(labelColor)}></span>
					<input class="label-input min-w-0 flex-1 border border-[#2a2a28] bg-[#0f0f0d] px-3 py-2 font-mono text-sm font-normal text-[#eae9e4] placeholder:text-[#6f6b5f] focus:border-[#d9a66c]" placeholder="d9a66c" bind:value={labelColor} />
				</div>
			</label>
			<div class="flex justify-end gap-2 pt-2">
				<button type="button" class="bg-[#242420] px-3 py-2 text-sm text-[#eae9e4] hover:bg-[#2a2a28]" onclick={closeModal}>Cancel</button>
				<button class="bg-[#eae9e4] px-3 py-2 text-sm font-medium text-[#0f0f0d] hover:bg-[#d8d3c5] disabled:opacity-50" disabled={busy || !labelName.trim()}>{busy ? 'Creating...' : 'Create label'}</button>
			</div>
		</form>
	</div>
{/if}

<style>
	.label-input:focus,
	.label-input:focus-visible {
		outline: none !important;
		box-shadow: none !important;
	}
</style>
