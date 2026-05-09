<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onDestroy } from 'svelte';
	import {
		closeWorkspace,
		createReviewComment,
		deleteReviewComment,
		deleteDraftWorkspace,
		getHistoryEntryDetail,
		getWorkspaceDetail,
		getWorkspaceMergePreview,
		isAbortError,
		listReviewComments,
		markWorkspaceReady,
		mergeWorkspace,
		reopenWorkspace,
		requestWorkspaceChanges,
		updateReviewComment,
		updateReviewCommentState,
		updateWorkspaceMetadata,
		updateWorkspaceLabels,
		type ChangedFile,
		type ReviewComment,
		type UserProfile
	} from '$lib/api';
	import { appData } from '$lib/appState';
	import Spinner from '$lib/components/Spinner.svelte';
	import ReviewSubmitDialog from '$lib/components/ReviewSubmitDialog.svelte';
	import WorkspaceConversation from '$lib/components/WorkspaceConversation.svelte';
	import WorkspaceFilesView from '$lib/components/WorkspaceFilesView.svelte';
	import WorkspaceHistoryTimeline from '$lib/components/WorkspaceHistoryTimeline.svelte';
	import { currentProjectAccess } from '$lib/projectAccessStore';
	import { labelActivity, metadataActivity } from '$lib/workspaceActivity';

	const tenant = $derived($page.params.tenant as string);
	const project = $derived($page.params.project as string);
	const workspaceName = $derived($page.params.workspace as string);

	type Tab = 'conversation' | 'files' | 'history';
	type DiffMode = 'inline' | 'split';
	const historyChunkSize = 20;

	let detail = $state<Awaited<ReturnType<typeof getWorkspaceDetail>> | null>(null);
	let changedFiles = $state<ChangedFile[]>([]);
	let previewError = $state('');
	let selectedPath = $state('');
	let loading = $state(true);
	let error = $state('');
	let busy = $state(false);
	let activeTab = $state<Tab>('conversation');
	let diffMode = $state<DiffMode>('inline');
	let reviewComments = $state<ReviewComment[]>([]);
	let historyFiles = $state<Record<string, ChangedFile[]>>({});
	let historyVisibleCount = $state(historyChunkSize);
	let selectedReviewRange = $state<{ file: string; startLine: number; endLine: number; side?: 'old' | 'new' } | null>(null);
	let pendingReviewComments = $state<ReviewComment[]>([]);
	let reviewSubmitOpen = $state(false);
	let canWrite = $state(false);
	let canMaintain = $state(false);
	let currentUser = $state<string | null>(null);
	let currentUserProfile = $state<UserProfile | null>(null);

	const unsubscribe = currentProjectAccess.subscribe((value) => {
		canWrite = Boolean(value?.can_write);
		canMaintain = Boolean(value?.can_maintain && !value?.archived);
	});
	const unsubscribeAppData = appData.subscribe((value) => {
		currentUser = value.me?.user ?? null;
		currentUserProfile = value.me?.profile ?? null;
	});

	onDestroy(() => {
		unsubscribe();
		unsubscribeAppData();
	});

	async function load(signal?: AbortSignal) {
		loading = true;
		error = '';
		previewError = '';
		try {
			const [workspaceDetail, comments, preview] = await Promise.all([
				getWorkspaceDetail(tenant, project, workspaceName, signal ? { signal } : {}),
				listReviewComments(tenant, project, { workspace: workspaceName }, signal ? { signal } : {}),
				getWorkspaceMergePreview(tenant, project, workspaceName, signal ? { signal } : {}).catch((e) => {
					if (isAbortError(e)) throw e;
					previewError = e instanceof Error ? e.message : 'Failed to load changed files';
					return { files: [] };
				})
			]);
			detail = workspaceDetail;
			reviewComments = comments.items;
			pendingReviewComments = [];
			changedFiles = [...preview.files].sort((a, b) => a.path.localeCompare(b.path));
			if (changedFiles.length === 0) {
				selectedPath = '';
			} else if (!selectedPath || !changedFiles.some((file) => file.path === selectedPath)) {
				selectedPath = changedFiles[0].path;
			}
			historyFiles = {};
			historyVisibleCount = historyChunkSize;
		} catch (e) {
			if (isAbortError(e)) return;
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			if (!signal?.aborted) loading = false;
		}
	}

	$effect(() => {
		if (!tenant || !project || !workspaceName) return;
		const controller = new AbortController();
		load(controller.signal);
		return () => controller.abort();
	});

	const workspaceComments = $derived(reviewComments.filter((comment) => comment.target_type === 'workspace'));
	const activityComments = $derived(reviewComments.filter((comment) => comment.target_type === 'activity'));
	const fileThreads = $derived([...reviewComments, ...pendingReviewComments].filter((comment) => comment.file));
	const unresolvedFileThreads = $derived(fileThreads.filter((comment) => comment.state !== 'resolved'));
	const commentCountsByFile = $derived(
		reviewComments.reduce<Record<string, number>>((counts, comment) => {
			if (comment.file && comment.state !== 'resolved') counts[comment.file] = (counts[comment.file] ?? 0) + 1;
			return counts;
		}, {})
	);
	const conversationActions = $derived(buildConversationActions());
	const visibleHistoryEntries = $derived(detail?.history.slice(0, historyVisibleCount) ?? []);
	const historyTotal = $derived(detail?.history.length ?? 0);

	$effect(() => {
		if (!detail || activeTab !== 'history') return;
		const missing = visibleHistoryEntries.filter((entry) => !(entry.id in historyFiles));
		if (missing.length === 0) return;
		const controller = new AbortController();
		loadHistoryFiles(missing, controller.signal).catch((e) => {
			if (!isAbortError(e)) error = e instanceof Error ? e.message : 'Failed to load history files';
		});
		return () => controller.abort();
	});

	function setTab(tab: Tab) {
		activeTab = tab;
	}

	function selectPath(path: string) {
		selectedPath = path;
		selectedReviewRange = null;
	}

	function openFileConversation(comment: ReviewComment) {
		if (!comment.file) return;
		selectedPath = comment.file;
		activeTab = 'files';
		selectedReviewRange = comment.target_type === 'line'
			? {
				file: comment.file,
				startLine: Number(comment.start_line ?? comment.line ?? comment.end_line ?? 0),
				endLine: Number(comment.end_line ?? comment.line ?? comment.start_line ?? 0),
				side: comment.side === 'old' ? 'old' : 'new'
			}
			: null;
	}

	function selectLineReview(path: string, startLine: number, endLine: number, side: 'old' | 'new' = 'new') {
		selectedPath = path;
		selectedReviewRange = { file: path, startLine, endLine, side };
	}

	async function submitReviewComment(body: string) {
		const target = selectedReviewRange
			? { target_type: 'line', workspace: workspaceName, file: selectedReviewRange.file, line: selectedReviewRange.startLine, start_line: selectedReviewRange.startLine, end_line: selectedReviewRange.endLine, side: selectedReviewRange.side }
			: selectedPath && activeTab === 'files'
				? { target_type: 'file', workspace: workspaceName, file: selectedPath }
				: { target_type: 'workspace', workspace: workspaceName };
		const comment = await createReviewComment(tenant, project, target, body);
		reviewComments = [...reviewComments, comment];
		if (activeTab === 'files' && canMaintain && detail?.is_ready && detail.status !== 'merged') {
			await requestWorkspaceChanges(tenant, project, workspaceName, body);
			await load();
		}
		selectedReviewRange = null;
	}

	async function submitFileReviewComment(path: string, body: string) {
		const range = selectedReviewRange?.file === path ? selectedReviewRange : null;
		selectedPath = path;
		pendingReviewComments = [
			...pendingReviewComments,
			{
				id: `pending:${crypto.randomUUID()}`,
				kind: 'comment',
				body,
				author: currentUser ?? 'me',
				author_profile: currentUserProfile,
				created_at: new Date().toISOString(),
				target_type: range ? 'line' : 'file',
				target_id: [range ? 'line' : 'file', workspaceName, path, range?.side, range?.startLine, range?.endLine].filter(Boolean).join(':'),
				workspace: workspaceName,
				file: path,
				line: range?.startLine ?? null,
				start_line: range?.startLine ?? null,
				end_line: range?.endLine ?? null,
				side: range?.side,
				state: 'open'
			}
		];
		selectedReviewRange = null;
	}

	async function submitConversationAction(body: string, action: string) {
		if (!detail) return;
		if (action === 'request_changes' && !body.trim()) {
			error = 'Request changes needs a comment.';
			return;
		}
		busy = true;
		error = '';
		try {
			if (body.trim()) {
				await createReviewComment(tenant, project, { target_type: 'workspace', workspace: workspaceName }, body.trim());
			}
			if (action === 'ready') {
				await markWorkspaceReady(tenant, project, workspaceName);
			} else if (action === 'request_changes') {
				await requestWorkspaceChanges(tenant, project, workspaceName, body.trim());
			} else if (action === 'close') {
				await closeWorkspace(tenant, project, workspaceName, 'closed', body.trim());
			} else if (action === 'not_planned') {
				await closeWorkspace(tenant, project, workspaceName, 'not_planned', body.trim());
			} else if (action === 'reopen') {
				await reopenWorkspace(tenant, project, workspaceName, body.trim());
			} else if (action === 'merge') {
				await mergeWorkspace(tenant, project, workspaceName);
			} else if (action === 'delete') {
				await deleteDraftWorkspace(tenant, project, workspaceName);
				goto(`/${tenant}/${project}/workspaces`);
				return;
			}
			await load();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Action failed';
		} finally {
			busy = false;
		}
	}

	async function submitPendingReview(body: string, action: 'comment' | 'approve' | 'request_changes') {
		busy = true;
		error = '';
		try {
			for (const comment of pendingReviewComments) {
				await createReviewComment(
					tenant,
					project,
					{
						target_type: comment.target_type,
						target_id: comment.target_id,
						workspace: workspaceName,
						file: comment.file,
						line: comment.line,
						start_line: comment.start_line,
						end_line: comment.end_line,
						side: comment.side
					},
					comment.body
				);
			}
			if (body) {
				await createReviewComment(tenant, project, { target_type: 'workspace', workspace: workspaceName }, body);
			}
			if (action === 'request_changes') {
				await requestWorkspaceChanges(tenant, project, workspaceName, body || 'Changes requested');
			} else if (action === 'approve' && !body) {
				await createReviewComment(tenant, project, { target_type: 'workspace', workspace: workspaceName }, 'Approved');
			}
			pendingReviewComments = [];
			reviewSubmitOpen = false;
			await load();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to submit review';
		} finally {
			busy = false;
		}
	}

	async function loadHistoryFiles(entries: typeof visibleHistoryEntries, signal: AbortSignal) {
		const loaded = await Promise.all(
			entries.map((entry) =>
				getHistoryEntryDetail(tenant, project, entry.id, { signal })
					.then((history) => [entry.id, history.files] as const)
					.catch((e) => {
						if (isAbortError(e)) throw e;
						return [entry.id, []] as const;
					})
			)
		);
		if (!signal.aborted) historyFiles = { ...historyFiles, ...Object.fromEntries(loaded) };
	}

	async function editReviewComment(comment: ReviewComment, body: string) {
		if (comment.id.startsWith('pending:')) {
			pendingReviewComments = pendingReviewComments.map((item) => item.id === comment.id ? { ...item, body, updated_at: new Date().toISOString() } : item);
			return;
		}
		const updated = await updateReviewComment(tenant, project, comment.id, body);
		reviewComments = reviewComments.map((item) => item.id === updated.id ? updated : item);
	}

	async function removeReviewComment(comment: ReviewComment) {
		if (comment.id.startsWith('pending:')) {
			pendingReviewComments = pendingReviewComments.filter((item) => item.id !== comment.id);
			return;
		}
		await deleteReviewComment(tenant, project, comment.id);
		reviewComments = reviewComments.filter((item) => item.id !== comment.id);
	}

	async function resolveReviewComment(comment: ReviewComment) {
		if (comment.id.startsWith('pending:')) {
			pendingReviewComments = pendingReviewComments.map((item) => item.id === comment.id ? { ...item, state: 'resolved' } : item);
			return;
		}
		const updated = await updateReviewCommentState(tenant, project, comment.id, 'resolved');
		reviewComments = reviewComments.map((item) => item.id === updated.id ? updated : item);
	}

	async function saveLabels(labels: string[]) {
		if (!detail) return;
		busy = true;
		try {
			const previous = detail.labels ?? [];
			const updated = await updateWorkspaceLabels(tenant, project, workspaceName, labels);
			detail = { ...detail, labels: updated.labels };
			await recordActivity(labelActivity(previous, updated.labels));
		} finally {
			busy = false;
		}
	}

	async function saveMetadata(metadata: Parameters<typeof updateWorkspaceMetadata>[3]) {
		if (!detail) return;
		busy = true;
		try {
			const previous = detail;
			const updated = await updateWorkspaceMetadata(tenant, project, workspaceName, metadata);
			detail = { ...detail, ...updated };
			await recordActivity(metadataActivity(previous, updated, metadata));
		} finally {
			busy = false;
		}
	}

	async function recordActivity(messages: string[]) {
		for (const message of messages) {
			if (!message.trim()) continue;
			const comment = await createReviewComment(tenant, project, { target_type: 'activity', workspace: workspaceName }, message);
			reviewComments = [...reviewComments, comment];
		}
	}

	function buildConversationActions() {
		if (!detail || detail.status === 'merged') return [];
		const actions: { value: string; label: string; withContentLabel?: string; description?: string; disabled?: boolean; requiresContent?: boolean; danger?: boolean }[] = [];
		const isDraft = !detail.is_ready && ['active', 'draft'].includes(detail.status);
		if (canMaintain && ['closed', 'not_planned', 'changes_requested'].includes(detail.status)) {
			actions.push({ value: 'reopen', label: 'Reopen', withContentLabel: 'Reopen with comment' });
		}
		if (canWrite && !detail.is_ready && !['closed', 'not_planned'].includes(detail.status)) {
			actions.push({ value: 'ready', label: 'Mark ready', withContentLabel: 'Mark ready with comment' });
		}
		if (canMaintain && detail.is_ready) {
			actions.push({ value: 'merge', label: 'Merge', withContentLabel: 'Merge with comment', disabled: unresolvedFileThreads.length > 0, description: unresolvedFileThreads.length ? 'Resolve file conversations first.' : undefined });
			actions.push({ value: 'request_changes', label: 'Request changes', withContentLabel: 'Request changes', requiresContent: true, description: 'Requires a comment.' });
		}
		if (canMaintain && !['closed', 'not_planned'].includes(detail.status)) {
			actions.push({ value: 'close', label: 'Close', withContentLabel: 'Close with comment' });
			actions.push({ value: 'not_planned', label: 'Close as not planned', withContentLabel: 'Close as not planned with comment' });
		}
		if (canWrite && isDraft) actions.push({ value: 'delete', label: 'Delete draft', withContentLabel: 'Delete draft with comment', danger: true });
		return actions;
	}

</script>

{#if loading}
	<Spinner />
{:else if error && !detail}
	<div class="text-sm text-[#d96c5a]">{error}</div>
{:else if detail}
	<div class={activeTab === 'files' ? 'mx-auto max-w-none' : 'mx-auto max-w-6xl'}>
		<div class={activeTab === 'files' ? 'mx-[calc(50%-50vw)] border-b border-[#2a2a28] px-6 pt-5' : ''}>
			<div class="mb-4">
				<h2 class="text-xl font-semibold text-[#f0eee4]">{detail.name}</h2>
				<div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#6f6b5f]">
					<span>{workspaceName} into {detail.parent_workspace ?? 'main'}</span>
					<span class="font-mono">{detail.head?.slice(0, 12) ?? 'empty'}</span>
					<span>{detail.changed_file_count} files</span>
					<span class="text-[#7cb97c]">+{detail.additions}</span>
					<span class="text-[#d96c5a]">-{detail.deletions}</span>
				</div>
			</div>

			<div class="flex flex-wrap gap-1 {activeTab === 'files' ? '' : 'mb-5 border-b border-[#2a2a28]'}">
				{#each [
					['conversation', 'Conversation', reviewComments.length],
					['files', 'Files changed', changedFiles.length],
					['history', 'History', detail.history.length]
				] as tab}
					<button class="border-b px-3 py-2 text-sm {activeTab === tab[0] ? 'border-[#d9a66c] text-[#f0eee4]' : 'border-transparent text-[#8c887e] hover:text-[#eae9e4]'}" onclick={() => setTab(tab[0] as Tab)}>
						{tab[1]} <span class="ml-1 text-xs text-[#6f6b5f]">{tab[2]}</span>
					</button>
				{/each}
			</div>
		</div>

		{#if error}
			<div class="mb-4 text-sm text-[#d96c5a]">{error}</div>
		{/if}

		{#if activeTab === 'conversation'}
			<WorkspaceConversation
				{detail}
				{tenant}
				{project}
				{workspaceName}
				{workspaceComments}
				{activityComments}
				{fileThreads}
				{unresolvedFileThreads}
				{conversationActions}
				{currentUser}
				{currentUserProfile}
				{canWrite}
				{canMaintain}
				{busy}
				onSubmitComment={submitReviewComment}
				onSubmitAction={submitConversationAction}
				onUpdateComment={editReviewComment}
				onDeleteComment={removeReviewComment}
				onOpenFileConversation={openFileConversation}
				onOpenHistory={() => setTab('history')}
				onSaveMetadata={saveMetadata}
				onSaveLabels={saveLabels}
			/>
		{:else if activeTab === 'files'}
			<WorkspaceFilesView
				{tenant}
				{project}
				{changedFiles}
				expectedFileCount={detail.changed_file_count}
				{previewError}
				reviewKey={`${tenant}/${project}/${workspaceName}/${detail.head ?? 'empty'}`}
				pendingReviewCount={pendingReviewComments.length}
				{selectedPath}
				{commentCountsByFile}
				{fileThreads}
				{selectedReviewRange}
				{diffMode}
				{currentUser}
				{canMaintain}
				readonly={(!canWrite && !canMaintain) || (detail.locked && !canMaintain)}
				onSelectPath={selectPath}
				onDiffModeChange={(mode) => (diffMode = mode)}
				onOpenConversation={openFileConversation}
				onOpenSubmitReview={() => (reviewSubmitOpen = true)}
				onLineComment={selectLineReview}
				onSubmitFileComment={submitFileReviewComment}
				onCancelInline={() => (selectedReviewRange = null)}
				onUpdateComment={editReviewComment}
				onDeleteComment={removeReviewComment}
				onResolveComment={resolveReviewComment}
			/>
		{:else}
			<WorkspaceHistoryTimeline entries={visibleHistoryEntries} {historyFiles} hasMore={visibleHistoryEntries.length < historyTotal} onOpenEntry={(entry) => goto(`/${tenant}/${project}/history/${entry.id}`)} onLoadMore={() => (historyVisibleCount = Math.min(historyVisibleCount + historyChunkSize, historyTotal))} />
		{/if}
	</div>
	{#if reviewSubmitOpen}
		<ReviewSubmitDialog count={pendingReviewComments.length} {canMaintain} onCancel={() => (reviewSubmitOpen = false)} onSubmit={submitPendingReview} />
	{/if}
{/if}
