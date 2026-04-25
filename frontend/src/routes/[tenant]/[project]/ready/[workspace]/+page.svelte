<script lang="ts">
	import { page } from '$app/stores';
	import { getMergeRequestDetail, mergeWorkspace, createIssueComment, type Comment } from '$lib/api';
	import CommentThread from '$lib/components/CommentThread.svelte';

	const tenant = $derived($page.params.tenant as string);
	const project = $derived($page.params.project as string);
	const workspaceName = $derived($page.params.workspace as string);

	let mr = $state<Awaited<ReturnType<typeof getMergeRequestDetail>> | null>(null);
	let loading = $state(true);
	let error = $state('');
	let busy = $state(false);

	async function load() {
		loading = true;
		error = '';
		try {
			mr = await getMergeRequestDetail(tenant, project, workspaceName);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (tenant && project && workspaceName) load();
	});

	async function handleMerge() {
		busy = true;
		try {
			await mergeWorkspace(tenant, project, workspaceName);
			await load();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			busy = false;
		}
	}

	async function handleComment(body: string) {
		if (!mr) return;
		// Reusing issue comment for now; TODO: dedicated MR comment endpoint
		const comment = await createIssueComment(tenant, project, 'mr-' + workspaceName, body);
		mr = { ...mr, comments: [...mr.comments, comment] };
	}
</script>

<div class="mx-auto max-w-3xl">
	{#if loading}
		<div class="text-sm text-[#6f6b5f]">Loading...</div>
	{:else if error}
		<div class="text-sm text-[#d96c5a]">{error}</div>
	{:else if mr}
		<div class="mb-4">
			<div class="flex items-center gap-2">
				<span class="rounded bg-[#2a2a28] px-1.5 py-0.5 text-xs font-medium {mr.status === 'open' ? 'text-[#7cb97c]' : 'text-[#a09d94]'}">{mr.status}</span>
				<h2 class="text-xl font-semibold text-[#f0eee4]">{mr.workspace} ready to merge into {mr.base_workspace}</h2>
			</div>
			<div class="mt-1 text-xs text-[#6f6b5f]">
				Opened by {mr.author} on {new Date(mr.created_at).toLocaleDateString()}
			</div>
		</div>

		<div class="mb-4 flex items-center gap-3">
			<button
				class="rounded bg-[#eae9e4] px-4 py-2 text-sm font-medium text-[#0f0f0d] hover:bg-[#d9d5c6] disabled:opacity-50"
				disabled={busy}
				onclick={handleMerge}
			>
				Merge workspace
			</button>
			{#if mr.checks_passing}
				<span class="flex items-center gap-1 text-xs text-[#7cb97c]">
					<span class="h-2 w-2 rounded-full bg-[#7cb97c]"></span>
					Checks passing
				</span>
			{:else}
				<span class="flex items-center gap-1 text-xs text-[#d96c5a]">
					<span class="h-2 w-2 rounded-full bg-[#d96c5a]"></span>
					Checks failing
				</span>
			{/if}
		</div>

		{#if mr.description}
			<div class="mb-6 rounded border border-[#2a2a28] bg-[#141412] px-4 py-3 text-sm leading-relaxed text-[#eae9e4]">
				{mr.description}
			</div>
		{/if}

		<div class="mb-4 rounded border border-[#2a2a28] bg-[#141412] p-4">
			<div class="flex items-center gap-4 text-sm">
				<div class="text-[#7cb97c]">+{mr.diff_stats.additions} additions</div>
				<div class="text-[#d96c5a]">-{mr.diff_stats.deletions} deletions</div>
			</div>
		</div>

		<div class="mt-6">
			<h4 class="mb-3 text-xs font-semibold uppercase tracking-wide text-[#6f6b5f]">Discussion ({mr.comments.length})</h4>
			<CommentThread comments={mr.comments} onSubmit={handleComment} />
		</div>
	{/if}
</div>
