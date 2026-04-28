<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { listReadyWorkspaces, mergeWorkspace, isAbortError, type WorkspaceStatus } from '$lib/api';
	import Spinner from '$lib/components/Spinner.svelte';

	const tenant = $derived($page.params.tenant as string);
	const project = $derived($page.params.project as string);

	let workspaces = $state<WorkspaceStatus[]>([]);
	let loading = $state(true);
	let error = $state('');

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

	async function handleMerge(name: string) {
		try {
			await mergeWorkspace(tenant, project, name);
			await load();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Merge failed';
		}
	}
</script>

<div class="mx-auto max-w-3xl">
	<div class="mb-4">
		<h3 class="text-sm font-semibold text-[#f0eee4]">Ready to merge <span class="ml-1 text-[#6f6b5f]">({workspaces.length})</span></h3>
		<p class="mt-1 text-xs text-[#6f6b5f]">Workspaces marked ready by their authors.</p>
	</div>

	{#if loading}
		<Spinner />
	{:else if error}
		<div class="text-sm text-[#d96c5a]">{error}</div>
	{:else}
		<div class="grid gap-2">
			{#each workspaces as ws}
				<div class="flex items-center justify-between rounded border border-[#2a2a28] bg-[#141412] px-4 py-3">
					<div class="min-w-0 flex-1">
						<div class="flex items-center gap-3">
							<button
								class="truncate text-left text-sm font-medium text-[#eae9e4] hover:underline"
								onclick={() => goto(`/${tenant}/${project}/ready/${ws.name}`)}
							>
								{ws.name}
							</button>
							<span class="rounded bg-[#2a2a28] px-1.5 py-0.5 text-[10px] text-[#a09d94]">ready</span>
						</div>
						<div class="mt-1 flex items-center gap-2 text-xs text-[#6f6b5f]">
							{#if ws.parent_workspace}
								<span>into {ws.parent_workspace}</span>
							{/if}
							{#if ws.head}
								<span class="font-mono">{ws.head.slice(0, 12)}</span>
							{/if}
						</div>
					</div>
					<button
						class="ml-3 shrink-0 rounded bg-[#eae9e4] px-3 py-1.5 text-xs font-medium text-[#0f0f0d] hover:bg-[#d9d5c6]"
						onclick={() => handleMerge(ws.name)}
					>
						Merge
					</button>
				</div>
			{:else}
				<div class="rounded border border-[#2a2a28] bg-[#141412] p-8 text-center">
					<p class="text-sm text-[#8c887e]">No workspaces ready to merge.</p>
					<p class="mt-1 text-xs text-[#6f6b5f]">Mark a workspace as ready from its detail page.</p>
				</div>
			{/each}
		</div>
	{/if}
</div>
