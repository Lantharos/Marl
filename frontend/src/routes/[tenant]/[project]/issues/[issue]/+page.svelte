<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { onDestroy, onMount } from 'svelte';
	import {
		createIssueComment,
		deleteIssue,
		getIssue,
		isAbortError,
		listIssueComments,
		setIssueAssignees,
		setIssueLabels,
		setIssueLocked,
		setIssueMilestone,
		setIssuePinned,
		setIssueType,
		setIssueWorkspace,
		transferIssue,
		updateIssue,
		updateIssueStatus,
		type Comment,
		type Issue,
		type IssueType
	} from '$lib/api';
	import ContentComposer, { type ComposerAction } from '$lib/components/ContentComposer.svelte';
	import IssueMetadataSidebar from '$lib/components/IssueMetadataSidebar.svelte';
	import Markdown from '$lib/components/Markdown.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import UserProfileLink from '$lib/components/UserProfileLink.svelte';
	import { currentProjectAccess } from '$lib/projectAccessStore';
	import CheckCircle2 from 'lucide-svelte/icons/check-circle-2';
	import Circle from 'lucide-svelte/icons/circle';
	import MessageSquare from 'lucide-svelte/icons/message-square';

	const tenant = $derived($page.params.tenant as string);
	const project = $derived($page.params.project as string);
	const issueId = $derived($page.params.issue as string);

	type IssueDetail = Issue & { comments: Comment[] };

	let issue: IssueDetail | null = $state(null);
	let loading = $state(true);
	let error = $state('');
	let editing = $state(false);
	let editTitle = $state('');
	let editBody = $state('');
	let commentBody = $state('');
	let busy = $state(false);
	let statusBusy = $state(false);
	let commentBusy = $state(false);
	let canWrite = $state(false);
	let canMaintain = $state(false);

	const unsubscribe = currentProjectAccess.subscribe((value) => {
		canWrite = Boolean(value?.can_write);
		canMaintain = Boolean(value?.can_maintain && !value?.archived);
	});

	onDestroy(unsubscribe);

	$effect(() => {
		if (!canWrite) editing = false;
	});

	const participants = $derived(() => {
		if (!issue) return [];
		const rows = new Map<string, { user: string; profile?: Issue['author_profile'] }>();
		rows.set(issue.author, { user: issue.author, profile: issue.author_profile });
		for (const comment of issue.comments) rows.set(comment.author, { user: comment.author, profile: comment.author_profile });
		for (const user of issue.assignees ?? []) {
			if (!rows.has(user)) rows.set(user, { user });
		}
		return [...rows.values()];
	});
	const issueActions = $derived(buildIssueActions());
	const timelineEntries = $derived(buildTimelineEntries());

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

	onMount(() => {
		const controller = new AbortController();
		load(controller.signal);
		return () => controller.abort();
	});

	async function handleComment(body: string) {
		if (!issue) return;
		commentBusy = true;
		try {
			const comment = await createIssueComment(tenant, project, issue.id, body);
			issue = { ...issue, comment_count: (issue.comment_count ?? issue.comments.length) + 1, comments: [...issue.comments, comment] };
			commentBody = '';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			commentBusy = false;
		}
	}

	async function handleIssueAction(body: string, action: string) {
		if (!issue) return;
		statusBusy = true;
		try {
			if (body.trim()) {
				const comment = await createIssueComment(tenant, project, issue.id, body.trim());
				issue = { ...issue, comment_count: (issue.comment_count ?? issue.comments.length) + 1, comments: [...issue.comments, comment] };
			}
			const updated = action === 'reopen'
				? await updateIssueStatus(tenant, project, issue.id, 'open')
				: await updateIssueStatus(tenant, project, issue.id, 'closed', action === 'not_planned' ? 'not_planned' : action === 'duplicate' ? 'duplicate' : 'completed');
			await applyIssueUpdate(updated);
			commentBody = '';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			statusBusy = false;
		}
	}

	async function saveEdit() {
		if (!issue || !editTitle.trim()) return;
		busy = true;
		try {
			const updated = await updateIssue(tenant, project, issue.id, { title: editTitle.trim(), body: editBody.trim() });
			await applyIssueUpdate(updated);
			editing = false;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			busy = false;
		}
	}

	async function saveMetadata(patch: { labels?: string[]; assignees?: string[]; milestone?: string | null; issue_type?: IssueType | null; workspace?: string | null; close_issue?: boolean; locked?: boolean; pinned?: boolean }) {
		if (!issue) return;
		busy = true;
		try {
			let updated = patch.labels
				? await setIssueLabels(tenant, project, issue.id, patch.labels)
				: patch.assignees
					? await setIssueAssignees(tenant, project, issue.id, patch.assignees)
					: 'milestone' in patch
						? await setIssueMilestone(tenant, project, issue.id, patch.milestone ?? null)
						: 'issue_type' in patch
							? await setIssueType(tenant, project, issue.id, patch.issue_type ?? null)
							: 'workspace' in patch
								? await setIssueWorkspace(tenant, project, issue.id, patch.workspace ?? null)
								: 'locked' in patch
									? await setIssueLocked(tenant, project, issue.id, Boolean(patch.locked))
									: 'pinned' in patch
										? await setIssuePinned(tenant, project, issue.id, Boolean(patch.pinned))
										: issue;
			if (patch.close_issue && currentState(updated) !== 'closed') {
				updated = await updateIssueStatus(tenant, project, issue.id, 'closed', 'completed');
			}
			await applyIssueUpdate(updated);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			busy = false;
		}
	}

	async function applyIssueUpdate(updated: Issue) {
		if (!issue) return;
		const comments = await listIssueComments(tenant, project, updated.id);
		issue = { ...issue, ...updated, comments };
	}

	async function handleTransfer(targetTenant: string, targetProject: string) {
		if (!issue) return;
		const transferred = await transferIssue(tenant, project, issue.id, targetTenant, targetProject);
		await goto(`/${targetTenant}/${targetProject}/issues/${transferred.number}`);
	}

	async function handleDelete() {
		if (!issue) return;
		await deleteIssue(tenant, project, issue.id);
		await goto(`/${tenant}/${project}/issues`);
	}

	function issueDate(value: string | null | undefined) {
		return value ? new Date(value).toLocaleString() : '';
	}

	function currentState(item: Issue | null) {
		return item?.state ?? item?.status ?? 'open';
	}

	function stateText(item: Issue) {
		if (currentState(item) === 'open') return 'Open';
		if (item.state_reason === 'not_planned') return 'Closed as not planned';
		if (item.state_reason === 'duplicate') return 'Closed as duplicate';
		return 'Closed';
	}

	function buildIssueActions(): ComposerAction[] {
		if (!issue || !canWrite) return [];
		if (currentState(issue) === 'closed') {
			return [{ value: 'reopen', label: 'Reopen issue', withContentLabel: 'Reopen with comment' }];
		}
		return [
			{ value: 'close', label: 'Close issue', withContentLabel: 'Close with comment' },
			{ value: 'not_planned', label: 'Close as not planned', withContentLabel: 'Close as not planned with comment' },
			{ value: 'duplicate', label: 'Close as duplicate', withContentLabel: 'Close as duplicate with comment' }
		];
	}

	function buildTimelineEntries() {
		if (!issue) return [];
		return [...issue.comments].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
	}

</script>

<div class="mx-auto max-w-6xl">
	{#if loading}
		<Spinner />
	{:else if error && !issue}
		<div class="text-sm text-[#d96c5a]">{error}</div>
	{:else if issue}
		<div class="mb-7 border-b border-[#2a2a28] pb-5">
			<div class="flex items-start justify-between gap-4">
				<div class="min-w-0 flex-1">
					{#if editing}
						<input class="issue-title-input mb-2 w-full border border-transparent bg-[#141412] px-3 py-2 text-2xl text-[#f0eee4] focus:border-[#d9a66c]" bind:value={editTitle} />
					{:else}
						<h1 class="text-3xl leading-tight text-[#f0eee4]">{issue.title} <span class="text-[#6f6b5f]">#{issue.number}</span></h1>
					{/if}
					<div class="mt-3 flex flex-wrap items-center gap-2 text-sm text-[#8c887e]">
						<span class="inline-flex items-center gap-1 rounded-full px-3 py-1 text-white {currentState(issue) === 'open' ? 'bg-[#238636]' : 'bg-[#6f2930]'}">
							{#if currentState(issue) === 'open'}<Circle class="h-3.5 w-3.5" /> {stateText(issue)}{:else}<CheckCircle2 class="h-3.5 w-3.5" /> {stateText(issue)}{/if}
						</span>
						<span><UserProfileLink user={issue.author} profile={issue.author_profile} className="text-[#a09d94]" /> opened this issue on {new Date(issue.created_at).toLocaleDateString()}</span>
						<span>·</span>
						<span>{issue.comment_count ?? issue.comments.length} {(issue.comment_count ?? issue.comments.length) === 1 ? 'comment' : 'comments'}</span>
					</div>
				</div>
			</div>
		</div>

		{#if error}
			<div class="mb-4 border border-[#4a2a24] bg-[#1a1110] px-3 py-2 text-sm text-[#d96c5a]">{error}</div>
		{/if}

		<div class="grid gap-8 lg:grid-cols-[1fr_280px]">
			<section class="relative min-w-0">
				<div class="relative grid gap-5 before:absolute before:left-[13px] before:top-0 before:bottom-0 before:w-px before:bg-[#2a2a28]">
					<div class="relative z-10 grid grid-cols-[28px_1fr] gap-3">
						<UserAvatar user={issue.author} profile={issue.author_profile} />
						<div class="min-w-0 border border-[#2a2a28] bg-[#0f0f0d]">
							<div class="flex items-center justify-between border-b border-[#252522] bg-[#141412] px-3 py-2 text-sm">
								<div class="min-w-0 truncate">
									<UserProfileLink user={issue.author} profile={issue.author_profile} className="font-medium text-[#eae9e4]" />
									<span class="ml-1 text-[#8c887e]">opened {issueDate(issue.created_at)}</span>
								</div>
								{#if canWrite}
									<button class="text-xs text-[#8c887e] hover:text-[#eae9e4]" onclick={() => (editing = !editing)}>{editing ? 'Cancel' : 'Edit'}</button>
								{/if}
							</div>
							<div class="p-4">
								{#if editing}
									<ContentComposer value={editBody} placeholder="Type your description here..." minHeight="220px" submitLabel="Save" busy={busy} disabled={!editTitle.trim()} onInput={(value) => (editBody = value)} onSubmit={saveEdit} onCancel={() => (editing = false)} />
								{:else if issue.body.trim()}
									<Markdown source={issue.body} />
								{:else}
									<p class="text-sm text-[#6f6b5f]">No description provided.</p>
								{/if}
							</div>
						</div>
					</div>

					{#each timelineEntries as comment}
						{#if (comment.target_type ?? 'comment') === 'activity'}
							<div class="relative z-10 grid grid-cols-[28px_1fr] gap-3 py-2">
								<UserAvatar user={comment.author} profile={comment.author_profile} ring />
								<div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 py-1 text-sm text-[#8c887e]">
									<UserProfileLink user={comment.author} profile={comment.author_profile} className="font-medium text-[#eae9e4]" />
									<span>{comment.body}</span>
									<span>{issueDate(comment.created_at)}</span>
								</div>
							</div>
						{:else}
							<div class="relative z-10 grid grid-cols-[28px_1fr] gap-3">
								<UserAvatar user={comment.author} profile={comment.author_profile} />
								<div class="min-w-0 border border-[#2a2a28] bg-[#0f0f0d]">
									<div class="border-b border-[#252522] bg-[#141412] px-3 py-2 text-sm">
										<UserProfileLink user={comment.author} profile={comment.author_profile} className="font-medium text-[#eae9e4]" />
										<span class="ml-1 text-[#8c887e]">commented {issueDate(comment.created_at)}</span>
									</div>
									<div class="p-4">
										<Markdown source={comment.body} />
									</div>
								</div>
							</div>
						{/if}
					{/each}

					{#if currentState(issue) === 'closed' && issue.closed_at && !timelineEntries.some((comment) => (comment.target_type ?? 'comment') === 'activity' && comment.target_id === 'state')}
						<div class="relative z-10 grid grid-cols-[28px_1fr] gap-3 py-2">
							<div class="flex h-7 w-7 items-center justify-center rounded-full bg-[#1f1f1c] text-[#d96c5a]"><CheckCircle2 class="h-3.5 w-3.5" /></div>
							<div class="flex items-center gap-2 py-2 text-sm text-[#8c887e]">
								<span><UserProfileLink user={issue.author} profile={issue.author_profile} className="text-[#a09d94]" /> {stateText(issue).toLowerCase()} on {new Date(issue.closed_at).toLocaleDateString()}</span>
							</div>
						</div>
					{/if}
				</div>

				{#if canWrite}
					<div class="relative mt-5 grid grid-cols-[28px_1fr] gap-3 before:absolute before:left-[13px] before:top-[-1.25rem] before:h-[calc(1.25rem+14px)] before:w-px before:bg-[#2a2a28]">
						<UserAvatar user={issue.author} profile={issue.author_profile} ring className="z-20" />
						<ContentComposer
							value={commentBody}
							submitLabel="Comment"
							busy={commentBusy || statusBusy}
							actions={issueActions}
							placeholder="Leave a comment..."
							onInput={(value) => (commentBody = value)}
							onSubmit={() => handleComment(commentBody)}
							onAction={handleIssueAction}
						/>
					</div>
				{:else}
					<div class="relative mt-5 grid grid-cols-[28px_1fr] gap-3 before:absolute before:left-[13px] before:top-[-1.25rem] before:h-[calc(1.25rem+14px)] before:w-px before:bg-[#2a2a28]">
						<div class="z-20 flex h-7 w-7 items-center justify-center rounded-full bg-[#1f1f1c] text-[#8c887e] ring-4 ring-[#0f0f0d]"><MessageSquare class="h-3.5 w-3.5" /></div>
						<p class="py-2 text-sm text-[#8c887e]">Sign in with write access to join the conversation.</p>
					</div>
				{/if}
			</section>

			<IssueMetadataSidebar
				{tenant}
				{project}
				labels={issue.labels}
				assignees={issue.assignees ?? []}
				milestone={issue.milestone ?? null}
				issueType={issue.issue_type ?? null}
				{canWrite}
				{canMaintain}
				locked={Boolean(issue.locked)}
				pinned={Boolean(issue.pinned)}
				workspace={issue.workspace ?? null}
				participants={participants()}
				onChange={saveMetadata}
				onTransfer={handleTransfer}
				onDelete={handleDelete}
			/>
		</div>
	{/if}
</div>

<style>
	.issue-title-input:focus,
	.issue-title-input:focus-visible {
		outline: none !important;
		box-shadow: none !important;
	}
</style>
