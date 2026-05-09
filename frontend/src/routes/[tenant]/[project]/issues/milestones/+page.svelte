<script lang="ts">
	import { page } from '$app/stores';
	import { onDestroy, onMount } from 'svelte';
	import { createMilestone, isAbortError, listMilestonesPage, type Milestone } from '$lib/api';
	import InfiniteLoader from '$lib/components/InfiniteLoader.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import { currentProjectAccess } from '$lib/projectAccessStore';
	import Plus from 'lucide-svelte/icons/plus';
	import Signpost from 'lucide-svelte/icons/signpost';
	import X from 'lucide-svelte/icons/x';

	const tenant = $derived($page.params.tenant as string);
	const project = $derived($page.params.project as string);
	const chunkSize = 25;

	let milestones = $state<Milestone[]>([]);
	let visible = $state(chunkSize);
	let stateFilter = $state<'open' | 'closed'>('open');
	let loading = $state(true);
	let error = $state('');
	let canMaintain = $state(false);
	let modalOpen = $state(false);
	let busy = $state(false);
	let title = $state('');
	let description = $state('');
	let dueAt = $state('');

	const unsubscribe = currentProjectAccess.subscribe((value) => {
		canMaintain = Boolean(value?.can_maintain && !value?.archived);
	});

	onDestroy(unsubscribe);

	const openMilestones = $derived(milestones.filter((milestone) => (milestone.state ?? 'open') === 'open'));
	const closedMilestones = $derived(milestones.filter((milestone) => (milestone.state ?? 'open') === 'closed'));
	const filteredMilestones = $derived((stateFilter === 'open' ? openMilestones : closedMilestones).slice().sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '')));
	const shownMilestones = $derived(filteredMilestones.slice(0, visible));

	$effect(() => {
		stateFilter;
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
			const page = await listMilestonesPage(tenant, project, { page: 1, perPage: 500, signal });
			milestones = page.items;
		} catch (e) {
			if (isAbortError(e)) return;
			error = e instanceof Error ? e.message : 'Failed to load milestones';
		} finally {
			if (!signal?.aborted) loading = false;
		}
	}

	async function submit() {
		if (!title.trim() || busy) return;
		busy = true;
		error = '';
		try {
			const milestone = await createMilestone(tenant, project, {
				title: title.trim(),
				description: description.trim() || null,
				due_at: dueAt.trim() || null,
				state: 'open'
			});
			milestones = [milestone, ...milestones];
			closeModal();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to create milestone';
		} finally {
			busy = false;
		}
	}

	function closeModal() {
		modalOpen = false;
		title = '';
		description = '';
		dueAt = '';
	}

	function progress(milestone: Milestone) {
		const open = milestone.open_issues ?? 0;
		const closed = milestone.closed_issues ?? 0;
		const total = open + closed;
		return total ? Math.round((closed / total) * 100) : 0;
	}
</script>

<div class="mx-auto max-w-6xl">
	<div class="mb-5 flex items-center justify-between gap-4">
		<h1 class="text-xl font-semibold text-[#f0eee4]">Milestones</h1>
		{#if canMaintain}
			<button class="inline-flex h-9 items-center gap-1 bg-[#eae9e4] px-3 text-sm font-medium text-[#0f0f0d] hover:bg-[#d8d3c5]" onclick={() => (modalOpen = true)}><Plus class="h-4 w-4" /> New milestone</button>
		{/if}
	</div>

	{#if error}
		<div class="mb-4 border border-[#4a2a24] bg-[#1a1110] px-3 py-2 text-sm text-[#d96c5a]">{error}</div>
	{/if}

	{#if loading}
		<Spinner />
	{:else}
		<div class="border border-[#2a2a28] bg-[#0f0f0d]">
			<div class="flex items-center justify-between border-b border-[#2a2a28] bg-[#141412] px-4 py-3 text-sm">
				<div class="flex items-center gap-4">
					<button class={stateFilter === 'open' ? 'font-medium text-[#eae9e4]' : 'text-[#8c887e] hover:text-[#eae9e4]'} onclick={() => (stateFilter = 'open')}>Open <span class="text-[#6f6b5f]">{openMilestones.length}</span></button>
					<button class={stateFilter === 'closed' ? 'font-medium text-[#eae9e4]' : 'text-[#8c887e] hover:text-[#eae9e4]'} onclick={() => (stateFilter = 'closed')}>Closed <span class="text-[#6f6b5f]">{closedMilestones.length}</span></button>
				</div>
				<button class="text-[#8c887e] hover:text-[#eae9e4]">Sort</button>
			</div>
			<div class="divide-y divide-[#252522]">
				{#each shownMilestones as milestone}
					<div class="px-4 py-4">
						<div class="flex flex-wrap items-start justify-between gap-4">
							<div class="min-w-0 flex-1">
								<div class="text-sm font-medium text-[#eae9e4]">{milestone.title}</div>
								{#if milestone.description}<p class="mt-1 text-sm text-[#8c887e]">{milestone.description}</p>{/if}
								<p class="mt-2 text-xs text-[#6f6b5f]">{milestone.due_at ? `Due ${new Date(milestone.due_at).toLocaleDateString()}` : 'No due date'}</p>
							</div>
							<div class="w-44 shrink-0 text-xs text-[#8c887e]">
								<div class="mb-2 h-2 overflow-hidden bg-[#242420]">
									<div class="h-full bg-[#d9a66c]" style:width={`${progress(milestone)}%`}></div>
								</div>
								<div class="flex justify-between">
									<span>{progress(milestone)}%</span>
									<span>{milestone.open_issues ?? 0} open · {milestone.closed_issues ?? 0} closed</span>
								</div>
							</div>
						</div>
					</div>
				{:else}
					<div class="grid place-items-center gap-4 px-6 py-16 text-center">
						<Signpost class="h-8 w-8 text-[#8c887e]" />
						<div>
							<div class="text-lg font-semibold text-[#eae9e4]">You haven’t created any milestones.</div>
							<p class="mt-2 text-sm text-[#8c887e]">Use milestones to group issues and workspaces around a release or project.</p>
						</div>
						{#if canMaintain}
							<button class="bg-[#eae9e4] px-3 py-2 text-sm font-medium text-[#0f0f0d] hover:bg-[#d8d3c5]" onclick={() => (modalOpen = true)}>Create a milestone</button>
						{/if}
					</div>
				{/each}
			</div>
		</div>
		<InfiniteLoader active={shownMilestones.length < filteredMilestones.length} onVisible={() => (visible = Math.min(visible + chunkSize, filteredMilestones.length))} />
	{/if}
</div>

{#if modalOpen}
	<button class="fixed inset-0 z-40 cursor-default bg-[#0f0f0d]/70" aria-label="Close milestone dialog" onclick={closeModal}></button>
	<div class="fixed left-1/2 top-1/2 z-50 w-[min(520px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded border border-[#2a2a28] bg-[#141412] shadow-lg">
		<div class="flex items-center justify-between border-b border-[#2a2a28] px-4 py-3">
			<div class="text-sm font-medium text-[#eae9e4]">New milestone</div>
			<button class="text-[#8c887e] hover:text-[#eae9e4]" aria-label="Close" onclick={closeModal}><X class="h-4 w-4" /></button>
		</div>
		<form class="grid gap-4 p-4" onsubmit={(event) => { event.preventDefault(); submit(); }}>
			<label class="grid gap-2 text-sm font-medium text-[#eae9e4]">
				Title
				<input class="milestone-input border border-[#2a2a28] bg-[#0f0f0d] px-3 py-2 text-sm font-normal text-[#eae9e4] placeholder:text-[#6f6b5f] focus:border-[#d9a66c]" placeholder="Milestone title" bind:value={title} />
			</label>
			<label class="grid gap-2 text-sm font-medium text-[#eae9e4]">
				Description
				<textarea class="milestone-input min-h-24 resize-y border border-[#2a2a28] bg-[#0f0f0d] px-3 py-2 text-sm font-normal text-[#eae9e4] placeholder:text-[#6f6b5f] focus:border-[#d9a66c]" placeholder="Describe the milestone" bind:value={description}></textarea>
			</label>
			<label class="grid gap-2 text-sm font-medium text-[#eae9e4]">
				Due date
				<input class="milestone-input border border-[#2a2a28] bg-[#0f0f0d] px-3 py-2 text-sm font-normal text-[#eae9e4] placeholder:text-[#6f6b5f] focus:border-[#d9a66c]" placeholder="YYYY-MM-DD" bind:value={dueAt} />
			</label>
			<div class="flex justify-end gap-2 pt-2">
				<button type="button" class="bg-[#242420] px-3 py-2 text-sm text-[#eae9e4] hover:bg-[#2a2a28]" onclick={closeModal}>Cancel</button>
				<button class="bg-[#eae9e4] px-3 py-2 text-sm font-medium text-[#0f0f0d] hover:bg-[#d8d3c5] disabled:opacity-50" disabled={busy || !title.trim()}>{busy ? 'Creating...' : 'Create milestone'}</button>
			</div>
		</form>
	</div>
{/if}

<style>
	.milestone-input:focus,
	.milestone-input:focus-visible {
		outline: none !important;
		box-shadow: none !important;
	}
</style>
