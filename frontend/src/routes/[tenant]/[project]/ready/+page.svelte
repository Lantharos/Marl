<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { listMergeRequests, mergeWorkspace, type MergeRequest } from '$lib/api';

	const tenant = $derived($page.params.tenant as string);
	const project = $derived($page.params.project as string);

	let requests = $state<MergeRequest[]>([]);
	let loading = $state(true);
	let error = $state('');

	async function load() {
		loading = true;
		error = '';
		try {
			requests = await listMergeRequests(tenant, project);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (tenant && project) load();
	});

	async function handleMerge(workspace: string) {
		try {
			await mergeWorkspace(tenant, project, workspace);
			await load();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Merge failed';
		}
	}
</script>

<div class="mx-auto max-w-3xl">
	<div class="mb-4">
		<h3 class="text-sm font-semibold text-[#f0eee4]">Ready to merge <span class="ml-1 text-[#6f6b5f]">({requests.length})</span></h3>
		<p class="mt-1 text-xs text-[#6f6b5f]">Workspaces marked ready by their authors.</p>
	</div>

	{#if loading}
		<div class="text-sm text-[#6f6b5f]">Loading...</div>
	{:else if error}
		<div class="text-sm text-[#d96c5a]">{error}</div>
	{:else}
		<div class="grid gap-2">
			{#each requests as mr}
				<div class="flex items-center justify-between rounded border border-[#2a2a28] bg-[#141412] px-4 py-3">
					<div class="min-w-0 flex-1">
						<div class="flex items-center gap-3">
							<button
								class="truncate text-left text-sm font-medium text-[#eae9e4] hover:underline"
								onclick={() => goto(`/${tenant}/${project}/ready/${mr.workspace}`)}
							>
								{mr.workspace}
							</button>
							<span class="rounded bg-[#2a2a28] px-1.5 py-0.5 text-[10px] text-[#a09d94]">{mr.status}</span>
						</div>
						<div class="mt-1 flex items-center gap-2 text-xs text-[#6f6b5f]">
							<span>by {mr.author}</span>
							<span>{new Date(mr.created_at).toLocaleDateString()}</span>
							{#if mr.head}
								<span class="font-mono">{mr.head.slice(0, 12)}</span>
							{/if}
						</div>
						<div class="mt-1.5 flex items-center gap-1.5">
							<span class="h-2 w-2 rounded-full {mr.checks_passing ? 'bg-[#7cb97c]' : 'bg-[#d96c5a]'}"></span>
							<span class="text-xs text-[#6f6b5f]">{mr.checks_passing ? 'Checks passing' : 'Checks failing'}</span>
						</div>
					</div>
					<button
						class="ml-3 shrink-0 rounded bg-[#eae9e4] px-3 py-1.5 text-xs font-medium text-[#0f0f0d] hover:bg-[#d9d5c6]"
						onclick={() => handleMerge(mr.workspace)}
					>
						Merge
					</button>
				</div>
			{:else}
				<div class="py-10 text-center">
					<p class="text-sm text-[#6f6b5f]">No workspaces ready to merge.</p>
					<p class="mt-1 text-xs text-[#5c5c5a]">Mark a workspace as ready from its detail page.</p>
				</div>
			{/each}
		</div>
	{/if}
</div>
