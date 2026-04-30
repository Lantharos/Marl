<script lang="ts">
	import { page } from '$app/stores';
	import { onDestroy } from 'svelte';
	import {
		addIssueLabel,
		assignIssue,
		createIssueComment,
		getIssue,
		isAbortError,
		updateIssue,
		updateIssueStatus,
		type Comment,
		type Issue
	} from '$lib/api';
	import { appData } from '$lib/appState';
	import CommentThread from '$lib/components/CommentThread.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import { userName } from '$lib/identity';
	import CheckCircle2 from 'lucide-svelte/icons/check-circle-2';
	import Circle from 'lucide-svelte/icons/circle';

	const tenant = $derived($page.params.tenant as string);
	const project = $derived($page.params.project as string);
	const issueId = $derived($page.params.issue as string);

	let issue = $state<(Issue & { comments: Comment[] }) | null>(null);
	let loading = $state(true);
	let error = $state('');
	let editing = $state(false);
	let editTitle = $state('');
	let editBody = $state('');
	let label = $state('');
	let assignee = $state('');
	let busy = $state(false);
	let canMutate = $state(false);

	const unsubscribe = appData.subscribe((value) => {
		canMutate = Boolean(value.me);
	});

	onDestroy(unsubscribe);

	$effect(() => {
		if (!canMutate) editing = false;
	});

	async function load(signal?: AbortSignal) {
		loading = true;
		error = '';
		try {
			issue = await getIssue(tenant, project, issueId, signal ? { signal } : {});
			editTitle = issue.title;
			editBody = issue.body;
		} catch (e) {
			if (isAbortError(e)) return;
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			if (!signal?.aborted) loading = false;
		}
	}

	$effect(() => {
		if (!tenant || !project || !issueId) return;
		const controller = new AbortController();
		load(controller.signal);
		return () => controller.abort();
	});

	async function handleComment(body: string) {
		if (!issue) return;
		try {
			const comment = await createIssueComment(tenant, project, issue.id, body);
			issue = { ...issue, comments: [...issue.comments, comment] };
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		}
	}

	async function handleStatusChange() {
		if (!issue) return;
		const next = (issue.state ?? issue.status) === 'open' ? 'closed' : 'open';
		try {
			const updated = await updateIssueStatus(tenant, project, issue.id, next);
			issue = { ...issue, ...updated };
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		}
	}

	async function saveEdit() {
		if (!issue || !editTitle.trim()) return;
		busy = true;
		try {
			const updated = await updateIssue(tenant, project, issue.id, { title: editTitle.trim(), body: editBody.trim() });
			issue = { ...issue, ...updated };
			editing = false;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			busy = false;
		}
	}

	async function handleAddLabel() {
		if (!issue || !label.trim()) return;
		busy = true;
		try {
			const updated = await addIssueLabel(tenant, project, issue.id, label.trim());
			issue = { ...issue, ...updated };
			label = '';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			busy = false;
		}
	}

	async function handleAssign() {
		if (!issue || !assignee.trim()) return;
		busy = true;
		try {
			const updated = await assignIssue(tenant, project, issue.id, assignee.trim());
			issue = { ...issue, ...updated };
			assignee = '';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			busy = false;
		}
	}
</script>

<div class="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_260px]">
	{#if loading}
		<Spinner />
	{:else if error && !issue}
		<div class="text-sm text-[#d96c5a]">{error}</div>
	{:else if issue}
		<section class="min-w-0">
			<div class="mb-4 flex items-start gap-3">
				{#if (issue.state ?? issue.status) === 'open'}
					<Circle class="mt-1 h-5 w-5 shrink-0 text-[#7cb97c]" />
				{:else}
					<CheckCircle2 class="mt-1 h-5 w-5 shrink-0 text-[#d96c5a]" />
				{/if}
				<div class="min-w-0 flex-1">
					{#if editing}
						<input class="w-full rounded bg-[#141412] px-3 py-2 text-lg font-semibold text-[#f0eee4] outline-none" bind:value={editTitle} />
					{:else}
						<h2 class="text-xl font-semibold text-[#f0eee4]">{issue.title}</h2>
					{/if}
					<div class="mt-1 text-xs text-[#6f6b5f]">
						#{issue.number} opened by {userName(issue.author, issue.author_profile)} on {new Date(issue.created_at).toLocaleDateString()}
					</div>
				</div>
				{#if canMutate}
					<button class="rounded bg-[#2a2a28] px-3 py-1.5 text-xs font-medium text-[#eae9e4] hover:bg-[#3a3a36]" onclick={handleStatusChange}>
						{(issue.state ?? issue.status) === 'open' ? 'Close' : 'Reopen'}
					</button>
				{/if}
			</div>

			{#if error}
				<div class="mb-4 text-sm text-[#d96c5a]">{error}</div>
			{/if}

			<div class="rounded bg-[#141412]">
				<div class="flex items-center justify-between border-b border-[#252522] px-4 py-2">
					<div class="text-sm font-medium text-[#eae9e4]">{userName(issue.author, issue.author_profile)}</div>
					{#if canMutate}
						<button class="text-xs text-[#8c887e] hover:text-[#eae9e4]" onclick={() => (editing = !editing)}>{editing ? 'Cancel' : 'Edit'}</button>
					{/if}
				</div>
				{#if editing}
					<div class="grid gap-3 p-4">
						<textarea class="min-h-[180px] resize-y rounded bg-[#0f0f0d] px-3 py-2 text-sm text-[#eae9e4] outline-none" bind:value={editBody}></textarea>
						<div class="flex justify-end">
							<button class="rounded bg-[#eae9e4] px-3 py-1.5 text-xs font-medium text-[#0f0f0d]" disabled={busy || !editTitle.trim()} onclick={saveEdit}>Save</button>
						</div>
					</div>
				{:else}
					<div class="whitespace-pre-wrap px-4 py-3 text-sm leading-relaxed text-[#eae9e4]">{issue.body || 'No description.'}</div>
				{/if}
			</div>

			<div class="mt-6">
				<div class="mb-3 text-sm font-medium text-[#eae9e4]">Comments <span class="text-[#6f6b5f]">{issue.comments.length}</span></div>
				<CommentThread comments={issue.comments} onSubmit={handleComment} readonly={!canMutate} />
			</div>
		</section>

		<aside class="grid h-fit gap-5">
			<section>
				<div class="mb-2 text-sm font-medium text-[#eae9e4]">Labels</div>
				<div class="flex flex-wrap gap-1">
					{#each issue.labels as item}
						<span class="rounded bg-[#141412] px-2 py-1 text-xs text-[#a09d94]">{item}</span>
					{:else}
						<span class="text-xs text-[#6f6b5f]">None</span>
					{/each}
				</div>
				{#if canMutate}
					<div class="mt-2 flex gap-2">
						<input class="min-w-0 flex-1 rounded bg-[#141412] px-2 py-1.5 text-xs text-[#eae9e4] outline-none" placeholder="Add label" bind:value={label} />
						<button class="rounded bg-[#2a2a28] px-2 text-xs text-[#eae9e4]" disabled={busy || !label.trim()} onclick={handleAddLabel}>Add</button>
					</div>
				{/if}
			</section>

			<section>
				<div class="mb-2 text-sm font-medium text-[#eae9e4]">Assignees</div>
				<div class="grid gap-1">
					{#each issue.assignees ?? [] as user}
						<div class="rounded bg-[#141412] px-3 py-2 text-xs text-[#eae9e4]">{userName(user)}</div>
					{:else}
						<p class="text-xs text-[#6f6b5f]">No assignees.</p>
					{/each}
				</div>
				{#if canMutate}
					<div class="mt-2 flex gap-2">
						<input class="min-w-0 flex-1 rounded bg-[#141412] px-2 py-1.5 text-xs text-[#eae9e4] outline-none" placeholder="Assign user" bind:value={assignee} />
						<button class="rounded bg-[#2a2a28] px-2 text-xs text-[#eae9e4]" disabled={busy || !assignee.trim()} onclick={handleAssign}>Add</button>
					</div>
				{/if}
			</section>

			<section>
				<div class="mb-2 text-sm font-medium text-[#eae9e4]">Details</div>
				<div class="grid gap-1 text-xs">
					<div class="flex justify-between rounded bg-[#141412] px-3 py-2"><span class="text-[#6f6b5f]">State</span><span class="text-[#eae9e4]">{issue.state ?? issue.status}</span></div>
					<div class="flex justify-between rounded bg-[#141412] px-3 py-2"><span class="text-[#6f6b5f]">Milestone</span><span class="text-[#eae9e4]">{issue.milestone ?? 'None'}</span></div>
					<div class="flex justify-between rounded bg-[#141412] px-3 py-2"><span class="text-[#6f6b5f]">Workspace</span><span class="text-[#eae9e4]">{issue.workspace ?? 'None'}</span></div>
				</div>
			</section>
		</aside>
	{/if}
</div>
