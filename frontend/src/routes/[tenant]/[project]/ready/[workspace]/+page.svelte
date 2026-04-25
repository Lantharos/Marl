<script lang="ts">
	import { page } from '$app/stores';
	import { getReadyWorkspaceDetail, mergeWorkspace, createIssueComment, type Comment } from '$lib/api';
	import CommentThread from '$lib/components/CommentThread.svelte';

	const tenant = $derived($page.params.tenant as string);
	const project = $derived($page.params.project as string);
	const workspaceName = $derived($page.params.workspace as string);

	let ws = $state<Awaited<ReturnType<typeof getReadyWorkspaceDetail>> | null>(null);
	let loading = $state(true);
	let error = $state('');
	let busy = $state(false);

	async function load() {
		loading = true;
		error = '';
		try {
			ws = await getReadyWorkspaceDetail(tenant, project, workspaceName);
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
		if (!ws) return;
		const comment = await createIssueComment(tenant, project, 'ready-' + workspaceName, body);
		ws = { ...ws, comments: [...ws.comments, comment] };
	}
</script>

<div class="mx-auto max-w-3xl">
	{#if loading}
		<div class="text-sm text-[#6f6b5f]">Loading...</div>
	{:else if error}
		<div class="text-sm text-[#d96c5a]">{error}</div>
	{:else if ws}
		<div class="mb-4">
			<div class="flex items-center gap-2">
				<span class="rounded bg-[#2a2a28] px-1.5 py-0.5 text-xs font-medium text-[#7cb97c]">ready</span>
				<h2 class="text-xl font-semibold text-[#f0eee4]">{ws.name} ready to merge{ws.parent_workspace ? ` into ${ws.parent_workspace}` : ''}</h2>
			</div>
			{#if ws.head}
				<div class="mt-1 text-xs text-[#6f6b5f]">
					<span class="font-mono">{ws.head.slice(0, 12)}</span>
				</div>
			{/if}
		</div>

		<div class="mb-4 flex items-center gap-3">
			<button
				class="rounded bg-[#eae9e4] px-4 py-2 text-sm font-medium text-[#0f0f0d] hover:bg-[#d9d5c6] disabled:opacity-50"
				disabled={busy}
				onclick={handleMerge}
			>
				Merge workspace
			</button>
		</div>

		<div class="mt-6">
			<h4 class="mb-3 text-xs font-semibold uppercase tracking-wide text-[#6f6b5f]">Discussion ({ws.comments.length})</h4>
			<CommentThread comments={ws.comments} onSubmit={handleComment} />
		</div>
	{/if}
</div>
