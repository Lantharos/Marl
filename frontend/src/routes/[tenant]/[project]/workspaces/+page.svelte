<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onDestroy } from 'svelte';
	import {
		isAbortError,
		listWorkspaceStatuses,
		markWorkspaceReady,
		mergeWorkspace,
		type Paginated,
		type WorkspaceStatus
	} from '$lib/api';
	import PaginationControls from '$lib/components/PaginationControls.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import { currentProjectAccess } from '$lib/projectAccessStore';
	import CheckCircle2 from 'lucide-svelte/icons/check-circle-2';
	import ChevronRight from 'lucide-svelte/icons/chevron-right';
	import CircleDot from 'lucide-svelte/icons/circle-dot';
	import GitMerge from 'lucide-svelte/icons/git-merge';
	import GitPullRequest from 'lucide-svelte/icons/git-pull-request';

	const tenant = $derived($page.params.tenant as string);
	const project = $derived($page.params.project as string);
	const perPage = 20;

	let workspaces = $state<WorkspaceStatus[]>([]);
	let loading = $state(true);
	let busy = $state('');
	let error = $state('');
	let filter = $state<'open' | 'ready' | 'merged' | 'all'>('open');
	let workspacePage = $state(1);
	let canWrite = $state(false);
	let canMaintain = $state(false);

	const unsubscribe = currentProjectAccess.subscribe((value) => {
		canWrite = Boolean(value?.can_write);
		canMaintain = Boolean(value?.can_maintain);
	});

	onDestroy(unsubscribe);

	async function load(signal?: AbortSignal) {
		loading = true;
		error = '';
		try {
			const all = await listWorkspaceStatuses(tenant, project, signal ? { signal } : {});
			workspaces = all.filter((workspace) => workspace.name !== 'main');
		} catch (e) {
			if (isAbortError(e)) return;
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			if (!signal?.aborted) loading = false;
		}
	}

	$effect(() => {
		if (!tenant || !project) return;
		const controller = new AbortController();
		load(controller.signal);
		return () => controller.abort();
	});

	const openWorkspaces = $derived(workspaces.filter((workspace) => workspace.status !== 'merged'));
	const readyWorkspaces = $derived(workspaces.filter((workspace) => workspace.is_ready && workspace.status !== 'merged'));
	const mergedWorkspaces = $derived(workspaces.filter((workspace) => workspace.status === 'merged'));
	const filteredWorkspaces = $derived(
		filter === 'ready'
			? readyWorkspaces
			: filter === 'merged'
				? mergedWorkspaces
				: filter === 'all'
					? workspaces
					: openWorkspaces
	);
	const totalPages = $derived(Math.max(1, Math.ceil(filteredWorkspaces.length / perPage)));
	const visibleWorkspaces = $derived(filteredWorkspaces.slice((workspacePage - 1) * perPage, workspacePage * perPage));
	const pageData = $derived<Paginated<WorkspaceStatus>>({
		items: visibleWorkspaces,
		page: workspacePage,
		per_page: perPage,
		total: filteredWorkspaces.length,
		total_pages: totalPages,
		next: workspacePage < totalPages ? workspacePage + 1 : null,
		prev: workspacePage > 1 ? workspacePage - 1 : null
	});

	$effect(() => {
		if (workspacePage > totalPages) workspacePage = totalPages;
	});

	function setFilter(value: 'open' | 'ready' | 'merged' | 'all') {
		filter = value;
		workspacePage = 1;
	}

	async function handleReady(name: string) {
		busy = name;
		error = '';
		try {
			await markWorkspaceReady(tenant, project, name);
			await load();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Mark ready failed';
		} finally {
			busy = '';
		}
	}

	async function handleMerge(name: string) {
		busy = name;
		error = '';
		try {
			await mergeWorkspace(tenant, project, name);
			await load();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Merge failed';
		} finally {
			busy = '';
		}
	}

	function baseName(workspace: WorkspaceStatus) {
		return workspace.parent_workspace ?? 'main';
	}

	function statusLabel(workspace: WorkspaceStatus) {
		if (workspace.status === 'merged') return 'merged';
		if (workspace.is_ready) return workspace.mergeable ? 'ready' : 'ready, blocked';
		return 'draft';
	}

	function statusClass(workspace: WorkspaceStatus) {
		if (workspace.status === 'merged') return 'text-[#8c887e]';
		if (workspace.is_ready && workspace.mergeable) return 'text-[#7cb97c]';
		if (workspace.is_ready) return 'text-[#d9a66c]';
		return 'text-[#a09d94]';
	}

	function StatusIcon(workspace: WorkspaceStatus) {
		if (workspace.status === 'merged') return GitMerge;
		if (workspace.is_ready && workspace.mergeable) return CheckCircle2;
		if (workspace.is_ready) return CircleDot;
		return GitPullRequest;
	}
</script>

<div class="mx-auto max-w-5xl">
	<div class="mb-5 flex flex-wrap items-end justify-between gap-3">
		<div>
			<h3 class="text-sm font-semibold text-[#f0eee4]">Workspaces</h3>
			<p class="mt-1 text-xs text-[#6f6b5f]">Review isolated lines of work before they merge back.</p>
		</div>
		<div class="flex rounded border border-[#2a2a28] bg-[#141412] p-0.5">
			{#each [
				{ id: 'open', label: 'Open', count: openWorkspaces.length },
				{ id: 'ready', label: 'Ready', count: readyWorkspaces.length },
				{ id: 'merged', label: 'Merged', count: mergedWorkspaces.length },
				{ id: 'all', label: 'All', count: workspaces.length }
			] as item}
				<button
					class="rounded px-2.5 py-1 text-xs {filter === item.id ? 'bg-[#eae9e4] text-[#0f0f0d]' : 'text-[#8c887e] hover:bg-[#1b1b18] hover:text-[#eae9e4]'}"
					onclick={() => setFilter(item.id as 'open' | 'ready' | 'merged' | 'all')}
				>
					{item.label} <span class={filter === item.id ? 'text-[#4b4841]' : 'text-[#6f6b5f]'}>{item.count}</span>
				</button>
			{/each}
		</div>
	</div>

	{#if loading}
		<Spinner />
	{:else if error}
		<div class="text-sm text-[#d96c5a]">{error}</div>
	{:else if workspaces.length === 0}
		<div class="rounded border border-[#2a2a28] bg-[#141412] p-8 text-center">
			<p class="text-sm text-[#8c887e]">No workspaces yet.</p>
			<p class="mt-1 text-xs text-[#6f6b5f]">Create one with <code class="rounded bg-[#1e1e1c] px-1 py-0.5">pig work new</code>.</p>
		</div>
	{:else if filteredWorkspaces.length === 0}
		<div class="rounded border border-[#2a2a28] bg-[#141412] p-8 text-center">
			<p class="text-sm text-[#8c887e]">Nothing here.</p>
		</div>
	{:else}
		<div class="overflow-hidden rounded border border-[#2a2a28] bg-[#141412]">
			{#each visibleWorkspaces as workspace}
				{@const Icon = StatusIcon(workspace)}
				<div class="flex items-stretch border-b border-[#252522] last:border-b-0 hover:bg-[#181816]">
					<button
						class="group flex min-w-0 flex-1 items-start gap-3 px-4 py-3 text-left"
						onclick={() => goto(`/${tenant}/${project}/workspaces/${workspace.name}`)}
					>
						<Icon class="mt-0.5 h-4 w-4 shrink-0 {statusClass(workspace)}" />
						<div class="min-w-0 flex-1">
							<div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
								<span class="truncate text-sm font-medium text-[#eae9e4]">{workspace.name}</span>
								<span class="text-xs {statusClass(workspace)}">{statusLabel(workspace)}</span>
							</div>
							<div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#6f6b5f]">
								<span>{workspace.name} into {baseName(workspace)}</span>
								{#if workspace.head}
									<span class="font-mono">{workspace.head.slice(0, 12)}</span>
								{/if}
								{#if workspace.child_workspaces.length}
									<span>{workspace.child_workspaces.length} child workspace{workspace.child_workspaces.length === 1 ? '' : 's'}</span>
								{/if}
							</div>
						</div>
						<ChevronRight class="mt-1 h-4 w-4 shrink-0 text-[#6f6b5f] group-hover:text-[#eae9e4]" />
					</button>
					{#if (canWrite || canMaintain) && workspace.status !== 'merged'}
						<div class="flex items-center pr-4">
							{#if canMaintain && workspace.is_ready && workspace.mergeable}
								<button
									class="rounded bg-[#eae9e4] px-3 py-1.5 text-xs font-medium text-[#0f0f0d] hover:bg-[#d9d5c6] disabled:opacity-60"
									disabled={busy === workspace.name}
									onclick={() => handleMerge(workspace.name)}
								>
									{busy === workspace.name ? 'Merging...' : 'Merge'}
								</button>
							{:else if canWrite && !workspace.is_ready}
								<button
									class="rounded bg-[#2a2a28] px-3 py-1.5 text-xs font-medium text-[#eae9e4] hover:bg-[#3a3a36] disabled:opacity-60"
									disabled={busy === workspace.name}
									onclick={() => handleReady(workspace.name)}
								>
									{busy === workspace.name ? 'Marking...' : 'Ready'}
								</button>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>
		<PaginationControls data={pageData} onPage={(page) => (workspacePage = page)} />
	{/if}
</div>
