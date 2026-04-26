<script lang="ts">
	import { page } from '$app/stores';
	import { getIssue, createIssueComment, updateIssueStatus, type Issue, type Comment } from '$lib/api';
	import CommentThread from '$lib/components/CommentThread.svelte';

	const tenant = $derived($page.params.tenant as string);
	const project = $derived($page.params.project as string);
	const issueId = $derived($page.params.issue as string);

	let issue = $state<(Issue & { comments: Comment[] }) | null>(null);
	let loading = $state(true);
	let error = $state('');

	async function load() {
		loading = true;
		error = '';
		try {
			issue = await getIssue(tenant, project, issueId);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (tenant && project && issueId) load();
	});

	async function handleComment(body: string) {
		if (!issue) return;
		try {
			const comment = await createIssueComment(tenant, project, issueId, body);
			issue = { ...issue, comments: [...issue.comments, comment] };
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		}
	}

	async function handleStatusChange() {
		if (!issue) return;
		const next = issue.status === 'open' ? 'closed' : 'open';
		try {
			const updated = await updateIssueStatus(tenant, project, issueId, next);
			issue = { ...issue, status: updated.status };
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		}
	}
</script>

<div class="mx-auto max-w-3xl">
	{#if loading}
		<div class="text-sm text-[#6f6b5f]">Loading issue...</div>
	{:else if error}
		<div class="text-sm text-[#d96c5a]">{error}</div>
	{:else if issue}
		<div class="mb-4">
			<div class="flex items-center gap-2">
				<span class="rounded bg-[#2a2a28] px-1.5 py-0.5 text-xs font-medium {issue.status === 'open' ? 'text-[#7cb97c]' : 'text-[#d96c5a]'}">{issue.status}</span>
				<h2 class="text-xl font-semibold text-[#f0eee4]">{issue.title}</h2>
				<button
					onclick={handleStatusChange}
					class="ml-auto rounded border border-[#2a2a28] bg-[#1a1a18] px-3 py-1 text-xs text-[#eae9e4] transition-colors hover:bg-[#2a2a28] focus:outline-none focus:ring-[1px] focus:ring-[#d9a66c]"
				>
					{issue.status === 'open' ? 'Close' : 'Reopen'}
				</button>
			</div>
			<div class="mt-1 text-xs text-[#6f6b5f]">
				#{issue.number} opened by {issue.author} on {new Date(issue.created_at).toLocaleDateString()}
			</div>
		</div>

		<div class="rounded border border-[#2a2a28] bg-[#141412]">
			<div class="flex items-center gap-2 border-b border-[#2a2a28] px-4 py-2">
				<span class="text-sm font-medium text-[#eae9e4]">{issue.author}</span>
				<span class="text-xs text-[#6f6b5f]">commented on {new Date(issue.created_at).toLocaleDateString()}</span>
			</div>
			<div class="px-4 py-3 text-sm leading-relaxed text-[#eae9e4] whitespace-pre-wrap">{issue.body}</div>
		</div>

		<div class="mt-6">
			<h4 class="mb-3 text-xs font-semibold uppercase tracking-wide text-[#6f6b5f]">Comments ({issue.comments.length})</h4>
			<CommentThread comments={issue.comments} onSubmit={handleComment} />
		</div>
	{/if}
</div>
