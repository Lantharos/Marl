<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { listWorkspaceStatuses, mergeWorkspace, type WorkspaceStatus } from '$lib/api';

	const tenant = $derived($page.params.tenant as string);
	const project = $derived($page.params.project as string);

	let workspaces = $state<WorkspaceStatus[]>([]);
	let loading = $state(true);
	let error = $state('');

	async function load() {
		loading = true;
		error = '';
		try {
			const all = await listWorkspaceStatuses(tenant, project);
			workspaces = all.filter((w) => w.name !== 'main');
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (tenant && project) load();
	});

	async function handleMerge(name: string) {
		try {
			await mergeWorkspace(tenant, project, name);
			await load();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Merge failed';
		}
	}

	function statusColor(status: WorkspaceStatus['status']) {
		switch (status) {
			case 'ready': return 'text-[#7cb97c]';
			case 'merged': return 'text-[#a09d94]';
			default: return 'text-[#d9a66c]';
		}
	}

	function ciColor(status: WorkspaceStatus['ci_status']) {
		switch (status) {
			case 'passing': return 'bg-[#7cb97c]';
			case 'failing': return 'bg-[#d96c5a]';
			case 'running': return 'bg-[#d9a66c]';
			default: return 'bg-[#5c5c5a]';
		}
	}
</script>

<div class="mx-auto max-w-4xl">
	<div class="mb-4 flex items-center justify-between">
		<h3 class="text-sm font-semibold text-[#f0eee4]">Workspaces</h3>
		<p class="text-xs text-[#6f6b5f]">Derived from main. main is browsed in Code.</p>
	</div>

	{#if loading}
		<div class="text-sm text-[#6f6b5f]">Loading...</div>
	{:else if error}
		<div class="text-sm text-[#d96c5a]">{error}</div>
	{:else if workspaces.length === 0}
		<div class="rounded border border-[#2a2a28] bg-[#141412] p-8 text-center">
			<p class="text-sm text-[#8c887e]">No derived workspaces yet.</p>
			<p class="mt-1 text-xs text-[#6f6b5f]">Create a workspace with <code class="rounded bg-[#1e1e1c] px-1 py-0.5">pig work new</code>.</p>
		</div>
	{:else}
		<div class="grid gap-2">
			{#each workspaces as ws}
				<div class="flex items-center justify-between rounded border border-[#2a2a28] bg-[#141412] px-4 py-3">
					<div class="min-w-0 flex-1">
						<div class="flex items-center gap-3">
							<button
								class="truncate text-left text-sm font-medium text-[#eae9e4] hover:underline"
								onclick={() => goto(`/${tenant}/${project}/workspaces/${ws.name}`)}
							>
								{ws.name}
							</button>
							<span class="text-xs font-medium {statusColor(ws.status)}">{ws.status}</span>
							{#if ws.parent_workspace}
								<span class="text-xs text-[#6f6b5f]">from {ws.parent_workspace}</span>
							{/if}
						</div>
						<div class="mt-1 flex items-center gap-2">
							<span class="h-2 w-2 rounded-full {ciColor(ws.ci_status)}"></span>
							<span class="text-xs text-[#6f6b5f]">{ws.ci_status}</span>
							{#if ws.head}
								<span class="font-mono text-xs text-[#6f6b5f]">{ws.head.slice(0, 12)}</span>
							{/if}
						</div>
					</div>
					{#if ws.is_ready && ws.mergeable}
						<button
							class="ml-3 shrink-0 rounded bg-[#eae9e4] px-3 py-1.5 text-xs font-medium text-[#0f0f0d] hover:bg-[#d9d5c6]"
							onclick={() => handleMerge(ws.name)}
						>
							Merge
						</button>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
