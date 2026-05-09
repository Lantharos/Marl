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
		type HistoryEntry,
		type ReviewComment
	} from '$lib/api';
	import { appData } from '$lib/appState';
	import { downloadObjectText } from '$lib/objectApi';
	import FileDiffCard from '$lib/components/FileDiffCard.svelte';
	import FilePathTree from '$lib/components/FilePathTree.svelte';
	import ReviewThread from '$lib/components/ReviewThread.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import { userDisplayName, userInitials, withoutOpaqueUserIds } from '$lib/identity';
	import { currentProjectAccess } from '$lib/projectAccessStore';

	const tenant = $derived($page.params.tenant as string);
	const project = $derived($page.params.project as string);
	const entryId = $derived($page.params.entryId as string);

	let detail = $state<(HistoryEntry & { parent_id: string | null; files: { path: string; change_type: string; old_id: string | null; new_id: string | null }[] }) | null>(null);
	let loading = $state(true);
	let error = $state('');
	let selectedPath = $state('');
	let selectedOldText = $state<string | null>(null);
	let selectedNewText = $state<string | null>(null);
	let fileLoading = $state(false);
	let reviewComments = $state<ReviewComment[]>([]);
	let selectedReviewRange = $state<{ file: string; startLine: number; endLine: number; side?: 'old' | 'new' } | null>(null);
	let fileController: AbortController | null = null;
	let canWrite = $state(false);
	let canMaintain = $state(false);
	let currentUser = $state<string | null>(null);

	const unsubscribe = currentProjectAccess.subscribe((value) => {
		canWrite = Boolean(value?.can_write);
		canMaintain = Boolean(value?.can_maintain && !value?.archived);
	});
	const unsubscribeAppData = appData.subscribe((value) => {
		currentUser = value.me?.user ?? null;
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

	async function loadSelectedFile(path: string, signal: AbortSignal) {
		if (!detail) return;
		fileLoading = true;
		selectedOldText = null;
		selectedNewText = null;
		const file = detail.files.find((f) => f.path === path);
		if (!file) {
			fileLoading = false;
			return;
		}
		try {
			if (file.change_type !== 'added') {
				try {
					selectedOldText = await downloadObjectText(tenant, project, file.old_id, { signal });
				} catch (error) {
					if (isAbortError(error)) throw error;
					selectedOldText = null;
				}
			}
			if (file.change_type !== 'deleted') {
				try {
					selectedNewText = await downloadObjectText(tenant, project, file.new_id, { signal });
				} catch (error) {
					if (isAbortError(error)) throw error;
					selectedNewText = null;
				}
			}
		} finally {
			if (!signal.aborted) fileLoading = false;
		}
	}

	$effect(() => {
		if (!tenant || !project || !entryId) return;
		const controller = new AbortController();
		load(controller.signal);
		return () => {
			controller.abort();
			fileController?.abort();
		};
	});

	$effect(() => {
		if (!selectedPath || !detail) return;
		fileController?.abort();
		const controller = new AbortController();
		fileController = controller;
		loadSelectedFile(selectedPath, controller.signal)
			.catch((e) => {
				if (!isAbortError(e)) error = e instanceof Error ? e.message : 'Failed';
			})
			.finally(() => {
				if (fileController === controller) fileController = null;
			});
		return () => controller.abort();
	});

	const treeEntries = $derived(detail?.files.map((file) => ({ path: file.path, kind: 'file' as const, status: file.change_type })) ?? []);

	function actionLabel(kind: HistoryEntry['kind']) {
		switch (kind) {
			case 'save': return 'saved';
			case 'ship': return 'shipped';
			case 'cram': return 'crammed';
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

	function selectLineReview(startLine: number, endLine: number, side: 'old' | 'new' = 'new') {
		if (!selectedPath) return;
		selectedReviewRange = { file: selectedPath, startLine, endLine, side };
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
		await createReviewComment(tenant, project, target, body);
		const comments = await listReviewComments(tenant, project, { history_entry_id: entryId });
		reviewComments = comments.items;
		selectedReviewRange = null;
	}

	async function refreshReviewComments() {
		const comments = await listReviewComments(tenant, project, { history_entry_id: entryId });
		reviewComments = comments.items;
	}

	async function editReviewComment(comment: ReviewComment, body: string) {
		await updateReviewComment(tenant, project, comment.id, body);
		await refreshReviewComments();
	}

	async function removeReviewComment(comment: ReviewComment) {
		await deleteReviewComment(tenant, project, comment.id);
		await refreshReviewComments();
	}

	const activeReviewComments = $derived(
		reviewComments.filter((comment) => comment.target_type === 'save')
	);

	const fileReviewComments = $derived(
		reviewComments.filter((comment) => comment.file === selectedPath && comment.target_type === 'line')
	);

	const commentCountsByFile = $derived(
		reviewComments.reduce<Record<string, number>>((counts, comment) => {
			if (comment.file) counts[comment.file] = (counts[comment.file] ?? 0) + 1;
			return counts;
		}, {})
	);
</script>

<div class="flex flex-col gap-4 overflow-hidden" style="height: calc(100vh - 180px);">
	{#if loading}
		<Spinner />
	{:else if error}
		<div class="text-sm text-[#d96c5a]">{error}</div>
	{:else if detail}
		<div class="flex items-start gap-3 rounded border border-[#2a2a28] bg-[#141412] px-4 py-3">
			<div class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#2a2a28] text-[10px] font-medium text-[#eae9e4]">
				{#if detail.author_profile?.avatar_url}
					<img src={detail.author_profile.avatar_url} alt="" class="h-full w-full object-cover" />
				{:else}
					{userInitials(detail.author, detail.author_profile)}
				{/if}
			</div>
			<div class="min-w-0 flex-1">
				<div class="flex flex-wrap items-center gap-2">
					<span class="text-sm font-medium text-[#eae9e4]">{displayMessage(detail)}</span>
					<span class="text-xs text-[#6f6b5f]">{actionLabel(detail.kind)}</span>
					<span class="rounded bg-[#1e1e1c] px-1.5 py-0.5 text-[10px] text-[#6f6b5f]">{detail.workspace}</span>
					{#if detail.agent}
						<span class="rounded bg-[#1e1e1c] px-1.5 py-0.5 text-[10px] text-[#a09d94]">{detail.agent}{detail.model ? ` ${detail.model}` : ''}</span>
					{/if}
					{#if detail.signature}
						<span class="rounded border border-[#25462a] bg-[#142018] px-1.5 py-0.5 text-[10px] text-[#7cb97c]">signed</span>
					{:else if detail.snapshot_id}
						<span class="rounded border border-[#2a2a28] bg-[#10100e] px-1.5 py-0.5 text-[10px] text-[#6f6b5f]">unsigned</span>
					{/if}
				</div>
				<div class="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[#6f6b5f]">
					<span>{userDisplayName(detail.author, detail.author_profile)}</span>
					<span>{new Date(detail.timestamp).toLocaleString()}</span>
					{#if detail.snapshot_id}
						<span class="font-mono text-[10px]">{detail.snapshot_id.slice(0, 12)}</span>
					{/if}
				</div>
			</div>
		</div>

		{#if detail.files.length === 0}
			<div class="rounded border border-[#2a2a28] bg-[#141412] p-8 text-center">
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
			<div class="flex flex-col gap-4 overflow-hidden min-h-0">
				<div class="flex flex-col md:flex-row gap-4 overflow-hidden min-h-0">
					<div class="h-48 md:h-auto md:w-64 shrink-0 flex flex-col rounded border border-[#2a2a28] bg-[#141412]">
						<div class="shrink-0 border-b border-[#2a2a28] px-3 py-2 text-xs font-medium text-[#6f6b5f]">
							{detail.files.length} changed {detail.files.length === 1 ? 'file' : 'files'}
						</div>
						<div class="flex-1 overflow-auto min-h-0 py-1.5">
							<FilePathTree entries={treeEntries} {selectedPath} {commentCountsByFile} onSelect={selectPath} maxHeight="100%" minHeight="0px" fill={true} />
						</div>
					</div>
					<div class="flex-1 overflow-hidden rounded border border-[#2a2a28] bg-[#141412]">
						{#if fileLoading}
							<Spinner />
						{:else if selectedPath}
							<FileDiffCard
								path={selectedPath}
								oldText={selectedOldText}
								newText={selectedNewText}
								entry={detail}
								reviewComments={fileReviewComments}
								activeRange={selectedReviewRange}
								readonly={!canWrite && !canMaintain}
								onLineComment={selectLineReview}
								onSubmitInline={submitReviewComment}
								onCancelInline={() => (selectedReviewRange = null)}
								onUpdateComment={editReviewComment}
								onDeleteComment={removeReviewComment}
								{currentUser}
								{canMaintain}
							/>
						{/if}
					</div>
				</div>
				{#if activeReviewComments.length}
					<div class="rounded border border-[#2a2a28] bg-[#141412] p-4">
						<ReviewThread
							title="Save"
							comments={activeReviewComments}
							onSubmit={submitReviewComment}
							onUpdate={editReviewComment}
							onDelete={removeReviewComment}
							readonly={true}
							{currentUser}
							{canMaintain}
						/>
					</div>
				{/if}
			</div>
		{/if}
	{/if}
</div>
