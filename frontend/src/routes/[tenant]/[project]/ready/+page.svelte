<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { isAbortError, listReadyWorkspaces, mergeWorkspace, type Paginated, type WorkspaceStatus } from '$lib/api';
	import PaginationControls from '$lib/components/PaginationControls.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import CheckCircle2 from 'lucide-svelte/icons/check-circle-2';
	import ChevronRight from 'lucide-svelte/icons/chevron-right';
	import CircleDot from 'lucide-svelte/icons/circle-dot';

	const tenant = $derived($page.params.tenant as string);
	const project = $derived($page.params.project as string);
	const perPage = 20;

	let workspaces = $state<WorkspaceStatus[]>([]);
	let loading = $state(true);
	let busy = $state('');
	let error = $state('');
	let readyPage = $state(1);

	async function load(signal?: AbortSignal) {
		loading = true;
		error = '';
		try {
			workspaces = await listReadyWorkspaces(tenant, project, signal ? { signal } : {});
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

	const totalPages = $derived(Math.max(1, Math.ceil(workspaces.length / perPage)));
	const visibleWorkspaces = $derived(workspaces.slice((readyPage - 1) * perPage, readyPage * perPage));
	const pageData = $derived<Paginated<WorkspaceStatus>>({
		items: visibleWorkspaces,
		page: readyPage,
		per_page: perPage,
		total: workspaces.length,
		total_pages: totalPages,
		next: readyPage < totalPages ? readyPage + 1 : null,
		prev: readyPage > 1 ? readyPage - 1 : null
	});

	$effect(() => {
		if (readyPage > totalPages) readyPage = totalPages;
	});

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
</script>

<div class="mx-auto max-w-5xl">
	<div class="mb-5">
		<h3 class="text-sm font-semibold text-[#f0eee4]">Ready</h3>
		<p class="mt-1 text-xs text-[#6f6b5f]">Workspaces waiting for review and merge.</p>
	</div>

	{#if loading}
		<Spinner />
	{:else if error}
		<div class="text-sm text-[#d96c5a]">{error}</div>
	{:else if workspaces.length === 0}
		<div class="rounded border border-[#2a2a28] bg-[#141412] p-8 text-center">
			<p class="text-sm text-[#8c887e]">No workspaces ready to merge.</p>
			<p class="mt-1 text-xs text-[#6f6b5f]">Mark a workspace ready when its changes should be reviewed.</p>
		</div>
	{:else}
		<div class="overflow-hidden rounded border border-[#2a2a28] bg-[#141412]">
			{#each visibleWorkspaces as workspace}
				<div class="flex items-stretch border-b border-[#252522] last:border-b-0 hover:bg-[#181816]">
					<button
						class="group flex min-w-0 flex-1 items-start gap-3 px-4 py-3 text-left"
						onclick={() => goto(`/${tenant}/${project}/ready/${workspace.name}`)}
					>
						{#if workspace.mergeable}
							<CheckCircle2 class="mt-0.5 h-4 w-4 shrink-0 text-[#7cb97c]" />
						{:else}
							<CircleDot class="mt-0.5 h-4 w-4 shrink-0 text-[#d9a66c]" />
						{/if}
						<div class="min-w-0 flex-1">
							<div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
								<span class="truncate text-sm font-medium text-[#eae9e4]">{workspace.name}</span>
								<span class="text-xs {workspace.mergeable ? 'text-[#7cb97c]' : 'text-[#d9a66c]'}">
									{workspace.mergeable ? 'ready' : 'blocked'}
								</span>
							</div>
							<div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#6f6b5f]">
								<span>{workspace.name} into {baseName(workspace)}</span>
								{#if workspace.head}
									<span class="font-mono">{workspace.head.slice(0, 12)}</span>
								{/if}
							</div>
						</div>
						<ChevronRight class="mt-1 h-4 w-4 shrink-0 text-[#6f6b5f] group-hover:text-[#eae9e4]" />
					</button>
					{#if workspace.mergeable}
						<div class="flex items-center pr-4">
							<button
								class="rounded bg-[#eae9e4] px-3 py-1.5 text-xs font-medium text-[#0f0f0d] hover:bg-[#d9d5c6] disabled:opacity-60"
								disabled={busy === workspace.name}
								onclick={() => handleMerge(workspace.name)}
							>
								{busy === workspace.name ? 'Merging...' : 'Merge'}
							</button>
						</div>
					{/if}
				</div>
			{/each}
		</div>
		<PaginationControls data={pageData} onPage={(page) => (readyPage = page)} />
	{/if}
</div>
