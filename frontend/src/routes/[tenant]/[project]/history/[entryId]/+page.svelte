<script lang="ts">
	import { page } from '$app/stores';
	import { onDestroy } from 'svelte';
	import {
		createReviewComment,
		deleteReviewComment,
		getHistoryEntryDetail,
		isAbortError,
		listReviewComments,
		updateReviewComment,
		updateReviewCommentState,
		type HistoryEntry,
		type ReviewComment
	} from '$lib/api';
	import { appData } from '$lib/appState';
	import ReviewThread from '$lib/components/ReviewThread.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import WorkspaceFilesView from '$lib/components/WorkspaceFilesView.svelte';
	import { userDisplayName, userInitials, withoutOpaqueUserIds } from '$lib/identity';
	import { currentProjectAccess } from '$lib/projectAccessStore';

	const tenant = $derived($page.params.tenant as string);
	const project = $derived($page.params.project as string);
	const entryId = $derived($page.params.entryId as string);

	let detail = $state<(HistoryEntry & { parent_id: string | null; files: { path: string; change_type: string; old_id: string | null; new_id: string | null }[] }) | null>(null);
	let loading = $state(true);
	let error = $state('');
	let selectedPath = $state('');
	let reviewComments = $state<ReviewComment[]>([]);
	let selectedReviewRange = $state<{ file: string; startLine: number; endLine: number; side?: 'old' | 'new' } | null>(null);
	let diffMode = $state<'inline' | 'split'>('inline');
	let canWrite = $state(false);
	let canMaintain = $state(false);
	let currentUser = $state<string | null>(null);
	let vigilantMode = $state(false);

	const unsubscribe = currentProjectAccess.subscribe((value) => {
		canWrite = Boolean(value?.can_write);
		canMaintain = Boolean(value?.can_maintain && !value?.archived);
	});
	const unsubscribeAppData = appData.subscribe((value) => {
		currentUser = value.me?.user ?? null;
		vigilantMode = Boolean(value.me?.settings?.vigilant_mode);
	});

	onDestroy(() => {
		unsubscribe();
		unsubscribeAppData();
	});

	async function load(signal: AbortSignal) {
		loading = true;
		error = '';
		try {
			const [entryDetail, comments] = await Promise.all([
				getHistoryEntryDetail(tenant, project, entryId, { signal }),
				listReviewComments(tenant, project, { history_entry_id: entryId }, { signal })
			]);
			detail = entryDetail;
			reviewComments = comments.items;
			if (detail.files.length > 0) {
				selectedPath = detail.files[0].path;
				selectedReviewRange = null;
			}
		} catch (e) {
			if (isAbortError(e)) return;
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			if (!signal.aborted) loading = false;
		}
	}

	$effect(() => {
		if (!tenant || !project || !entryId) return;
		const controller = new AbortController();
		load(controller.signal);
		return () => controller.abort();
	});

	function actionLabel(kind: HistoryEntry['kind']) {
		switch (kind) {
			case 'save': return 'saved';
			case 'ship': return 'shipped';
			case 'pack':
			case 'cram': return 'packed';
			case 'merge': return 'merged';
			case 'ready': return 'marked ready';
			default: return kind;
		}
	}

	function displayMessage(entry: HistoryEntry) {
		return withoutOpaqueUserIds(entry.message) || entry.kind;
	}

	function selectPath(path: string) {
		selectedPath = path;
		selectedReviewRange = null;
	}

	function selectLineReview(path: string, startLine: number, endLine: number, side: 'old' | 'new' = 'new') {
		selectedPath = path;
		selectedReviewRange = { file: path, startLine, endLine, side };
	}

	function openFileConversation(comment: ReviewComment) {
		if (!comment.file) return;
		selectedPath = comment.file;
		selectedReviewRange = comment.target_type === 'line'
			? {
				file: comment.file,
				startLine: Number(comment.start_line ?? comment.line ?? comment.end_line ?? 0),
				endLine: Number(comment.end_line ?? comment.line ?? comment.start_line ?? 0),
				side: comment.side === 'old' ? 'old' : 'new'
			}
			: null;
	}

	async function submitReviewComment(body: string) {
		if (!detail) return;
		const target = selectedReviewRange
			? {
				target_type: 'line',
				history_entry_id: entryId,
				snapshot_id: detail.snapshot_id,
				workspace: detail.workspace,
				file: selectedReviewRange.file,
				line: selectedReviewRange.startLine,
				start_line: selectedReviewRange.startLine,
				end_line: selectedReviewRange.endLine,
				side: selectedReviewRange.side
			}
			: selectedPath
			? {
				target_type: 'file',
				history_entry_id: entryId,
				snapshot_id: detail.snapshot_id,
				workspace: detail.workspace,
				file: selectedPath
			}
			: {
				target_type: 'save',
				history_entry_id: entryId,
				snapshot_id: detail.snapshot_id,
				workspace: detail.workspace
			};
		const comment = await createReviewComment(tenant, project, target, body);
		reviewComments = [...reviewComments, comment];
		selectedReviewRange = null;
	}

	async function submitFileReviewComment(path: string, body: string) {
		if (!detail) return;
		const range = selectedReviewRange?.file === path ? selectedReviewRange : null;
		selectedPath = path;
		const target = range
			? {
				target_type: 'line',
				history_entry_id: entryId,
				snapshot_id: detail.snapshot_id,
				workspace: detail.workspace,
				file: path,
				line: range.startLine,
				start_line: range.startLine,
				end_line: range.endLine,
				side: range.side
			}
			: {
				target_type: 'file',
				history_entry_id: entryId,
				snapshot_id: detail.snapshot_id,
				workspace: detail.workspace,
				file: path
			};
		const comment = await createReviewComment(tenant, project, target, body);
		reviewComments = [...reviewComments, comment];
		selectedReviewRange = null;
	}

	async function editReviewComment(comment: ReviewComment, body: string) {
		const updated = await updateReviewComment(tenant, project, comment.id, body);
		reviewComments = reviewComments.map((item) => item.id === updated.id ? updated : item);
	}

	async function removeReviewComment(comment: ReviewComment) {
		await deleteReviewComment(tenant, project, comment.id);
		reviewComments = reviewComments.filter((item) => item.id !== comment.id);
	}

	async function resolveReviewComment(comment: ReviewComment) {
		const updated = await updateReviewCommentState(tenant, project, comment.id, 'resolved');
		reviewComments = reviewComments.map((item) => item.id === updated.id ? updated : item);
	}

	const activeReviewComments = $derived(
		reviewComments.filter((comment) => comment.target_type === 'save')
	);

	const fileThreads = $derived(reviewComments.filter((comment) => comment.file));

	const commentCountsByFile = $derived(
		reviewComments.reduce<Record<string, number>>((counts, comment) => {
			if (comment.file) counts[comment.file] = (counts[comment.file] ?? 0) + 1;
			return counts;
		}, {})
	);
</script>

<div class="mx-auto max-w-none">
	{#if loading}
		<Spinner />
	{:else if error}
		<div class="text-sm text-[#d96c5a]">{error}</div>
	{:else if detail}
		<div class="mx-[calc(50%-50vw)] border-b border-[#2a2a28] px-6 pt-5">
			<div class="mb-4 flex items-start gap-3">
				<div class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#2a2a28] text-[10px] font-medium text-[#eae9e4]">
					{#if detail.author_profile?.avatar_url}
						<img src={detail.author_profile.avatar_url} alt="" class="h-full w-full object-cover" />
					{:else}
						{userInitials(detail.author, detail.author_profile)}
					{/if}
				</div>
				<div class="min-w-0 flex-1">
					<div class="flex flex-wrap items-center gap-2">
						<h2 class="text-xl font-semibold text-[#f0eee4]">{displayMessage(detail)}</h2>
						<span class="text-xs text-[#6f6b5f]">{actionLabel(detail.kind)}</span>
						{#if detail.signature}
							<span class="rounded border border-[#25462a] bg-[#142018] px-1.5 py-0.5 text-[10px] text-[#7cb97c]">signed</span>
						{:else if vigilantMode && detail.snapshot_id}
							<span class="rounded border border-[#2a2a28] bg-[#10100e] px-1.5 py-0.5 text-[10px] text-[#6f6b5f]">unsigned</span>
						{/if}
					</div>
					<div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#6f6b5f]">
						<span>{userDisplayName(detail.author, detail.author_profile)}</span>
						<span>{new Date(detail.timestamp).toLocaleString()}</span>
						<span>{detail.workspace}</span>
						{#if detail.snapshot_id}
							<span class="font-mono">{detail.snapshot_id.slice(0, 12)}</span>
						{/if}
						<span>{detail.files.length} changed {detail.files.length === 1 ? 'file' : 'files'}</span>
						{#if detail.agent}
							<span>{detail.agent}{detail.model ? ` ${detail.model}` : ''}</span>
						{/if}
					</div>
				</div>
			</div>
		</div>

		{#if detail.files.length === 0}
			<div class="mx-auto mt-4 max-w-3xl rounded border border-[#2a2a28] bg-[#141412] p-8 text-center">
				<p class="text-sm text-[#8c887e]">No file changes for this entry.</p>
				<div class="mx-auto mt-6 max-w-lg text-left">
					<ReviewThread
						title="Save"
						comments={activeReviewComments}
						onSubmit={submitReviewComment}
						onUpdate={editReviewComment}
						onDelete={removeReviewComment}
						readonly={!canWrite && !canMaintain}
						{currentUser}
						{canMaintain}
					/>
				</div>
			</div>
		{:else}
			<WorkspaceFilesView
				{tenant}
				{project}
				changedFiles={detail.files}
				expectedFileCount={detail.files.length}
				previewError=""
				reviewKey={`${tenant}/${project}/history/${entryId}/${detail.snapshot_id ?? 'empty'}`}
				pendingReviewCount={0}
				{selectedPath}
				{commentCountsByFile}
				{fileThreads}
				{selectedReviewRange}
				{diffMode}
				{currentUser}
				{canMaintain}
				readonly={!canWrite && !canMaintain}
				fillSidebar={true}
				showReviewFocus={false}
				showViewedState={false}
				onSelectPath={selectPath}
				onDiffModeChange={(mode) => (diffMode = mode)}
				onOpenConversation={openFileConversation}
				onOpenSubmitReview={() => undefined}
				onLineComment={selectLineReview}
				onSubmitFileComment={submitFileReviewComment}
				onCancelInline={() => (selectedReviewRange = null)}
				onUpdateComment={editReviewComment}
				onDeleteComment={removeReviewComment}
				onResolveComment={resolveReviewComment}
			/>
		{/if}
	{/if}
</div>
