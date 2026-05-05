<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { onDestroy } from 'svelte';
	import {
		getWorkspaceDetail,
		getProjectFile,
		isAbortError,
		listReviewComments,
		mergeWorkspace,
		markWorkspaceReady,
		requestWorkspaceChanges,
		createReviewComment,
		type ReviewComment,
		type ProjectFile
	} from '$lib/api';
	import FileTreePane from '$lib/FileTreePane.svelte';
	import CodePane from '$lib/CodePane.svelte';
	import ReviewThread from '$lib/components/ReviewThread.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import { userDisplayName, userInitials, withoutOpaqueUserIds } from '$lib/identity';
	import { currentProjectAccess } from '$lib/projectAccessStore';

	const tenant = $derived($page.params.tenant as string);
	const project = $derived($page.params.project as string);
	const workspaceName = $derived($page.params.workspace as string);

	let detail = $state<Awaited<ReturnType<typeof getWorkspaceDetail>> | null>(null);
	let file = $state<ProjectFile | null>(null);
	let loading = $state(true);
	let error = $state('');
	let busy = $state(false);
	let reviewBusy = $state(false);
	let changeReason = $state('');
	let reviewComments = $state<ReviewComment[]>([]);
	let selectedReviewFile = $state<string | null>(null);
	let selectedReviewRange = $state<{ file: string; startLine: number; endLine: number } | null>(null);
	let fileController: AbortController | null = null;
	let canWrite = $state(false);
	let canMaintain = $state(false);

	const unsubscribe = currentProjectAccess.subscribe((value) => {
		canWrite = Boolean(value?.can_write);
		canMaintain = Boolean(value?.can_maintain && !value?.archived);
	});

	onDestroy(unsubscribe);

	async function load(signal?: AbortSignal) {
		loading = true;
		error = '';
		try {
			const [workspaceDetail, comments] = await Promise.all([
				getWorkspaceDetail(tenant, project, workspaceName, signal ? { signal } : {}),
				listReviewComments(tenant, project, { workspace: workspaceName }, signal ? { signal } : {})
			]);
			detail = workspaceDetail;
			reviewComments = comments.items;
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
		return () => {
			controller.abort();
			fileController?.abort();
		};
	});

	async function openFile(path: string) {
		const entry = detail?.files.entries.find((e) => e.path === path);
		if (entry?.entry_type !== 'blob') return;
		selectedReviewFile = path;
		selectedReviewRange = null;
		fileController?.abort();
		const controller = new AbortController();
		fileController = controller;
		try {
			file = await getProjectFile(tenant, project, path, workspaceName, undefined, { signal: controller.signal });
		} catch (e) {
			if (!isAbortError(e)) error = e instanceof Error ? e.message : 'Failed';
		} finally {
			if (fileController === controller) fileController = null;
		}
	}

	async function handleReady() {
		busy = true;
		try {
			await markWorkspaceReady(tenant, project, workspaceName);
			await load();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			busy = false;
		}
	}

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

	async function submitReviewComment(body: string) {
		const target = selectedReviewRange
			? {
				target_type: 'line',
				workspace: workspaceName,
				file: selectedReviewRange.file,
				line: selectedReviewRange.startLine,
				start_line: selectedReviewRange.startLine,
				end_line: selectedReviewRange.endLine
			}
			: selectedReviewFile
			? {
				target_type: 'file',
				workspace: workspaceName,
				file: selectedReviewFile
			}
			: { target_type: 'workspace', workspace: workspaceName };
		await createReviewComment(tenant, project, target, body);
		const comments = await listReviewComments(tenant, project, { workspace: workspaceName });
		reviewComments = comments.items;
		selectedReviewRange = null;
	}

	async function handleRequestChanges() {
		const reason = changeReason.trim();
		if (!reason) return;
		reviewBusy = true;
		error = '';
		try {
			await requestWorkspaceChanges(tenant, project, workspaceName, reason);
			await createReviewComment(tenant, project, { target_type: 'workspace', workspace: workspaceName }, reason);
			changeReason = '';
			await load();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Request changes failed';
		} finally {
			reviewBusy = false;
		}
	}

	function selectLineReview(startLine: number, endLine: number) {
		if (!file) return;
		selectedReviewFile = file.path;
		selectedReviewRange = { file: file.path, startLine, endLine };
	}

	const activeReviewComments = $derived(
		reviewComments.filter((comment) => comment.target_type === 'workspace')
	);

	const fileReviewComments = $derived(
		reviewComments.filter((comment) => comment.file === file?.path && comment.target_type === 'line')
	);

	const commentCountsByFile = $derived(
		reviewComments.reduce<Record<string, number>>((counts, comment) => {
			if (comment.file) counts[comment.file] = (counts[comment.file] ?? 0) + 1;
			return counts;
		}, {})
	);

	function historyMessage(entry: { message: string; kind: string }) {
		return withoutOpaqueUserIds(entry.message) || entry.kind;
	}
</script>

{#if loading}
	<Spinner />
{:else if error}
	<div class="text-sm text-[#d96c5a]">{error}</div>
{:else if detail}
	<div class="mx-auto max-w-5xl">
		<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
			<div>
				<h2 class="text-xl font-semibold text-[#f0eee4]">{detail.name}</h2>
				<div class="mt-1 flex items-center gap-2 text-xs text-[#6f6b5f]">
					<span class="font-mono">{detail.head?.slice(0, 12) ?? 'empty'}</span>
					{#if detail.parent_workspace}
						<span>from {detail.parent_workspace}</span>
					{/if}
				</div>
			</div>
			{#if canWrite || canMaintain}
			<div class="flex gap-2">
				{#if canWrite && !detail.is_ready}
					<button
						class="rounded bg-[#6ba4c7] px-3 py-1.5 text-xs font-medium text-[#0f0f0d] hover:bg-[#5a93b6]"
						disabled={busy}
						onclick={handleReady}
					>
						Mark ready
					</button>
				{:else if canMaintain}
					<button
						class="rounded bg-[#eae9e4] px-3 py-1.5 text-xs font-medium text-[#0f0f0d] hover:bg-[#d9d5c6]"
						disabled={busy}
						onclick={handleMerge}
					>
						Merge
					</button>
				{/if}
			</div>
			{/if}
		</div>

		<div class="grid gap-5 xl:grid-cols-[1fr_300px]">
			<div class="rounded border border-[#2a2a28] bg-[#141412] p-4">
				<h4 class="mb-2 text-xs font-semibold uppercase tracking-wide text-[#6f6b5f]">Files</h4>
				<div class="flex flex-col md:flex-row gap-0 overflow-hidden" style="height: calc(100vh - 220px);">
					<div class="h-48 md:h-auto md:w-[260px] shrink-0 flex flex-col border-b md:border-b-0 md:border-r border-[#2a2a28]">
						<div class="flex-1 overflow-auto min-h-0 pr-3">
							<FileTreePane entries={detail.files.entries} selectedPath={file?.path ?? ''} onSelect={openFile} commentCounts={commentCountsByFile} />
						</div>
					</div>
					<div class="min-w-0 flex-1 overflow-auto pl-0 md:pl-4 pt-3 md:pt-0">
						<CodePane
							{file}
							reviewComments={fileReviewComments}
							activeRange={selectedReviewRange}
							readonly={!canWrite && !canMaintain}
							onLineComment={selectLineReview}
							onSubmitInline={submitReviewComment}
							onCancelInline={() => (selectedReviewRange = null)}
						/>
					</div>
				</div>
			</div>

			<div class="grid gap-5">
				<div class="rounded border border-[#2a2a28] bg-[#141412] p-4">
					<ReviewThread
						title={detail.name}
						comments={activeReviewComments}
						onSubmit={async (body: string) => {
							selectedReviewFile = null;
							selectedReviewRange = null;
							await submitReviewComment(body);
						}}
						readonly={!canWrite && !canMaintain}
					/>
					{#if canMaintain && detail.is_ready && detail.status !== 'merged'}
						<form class="mt-4 grid gap-2 border-t border-[#2a2a28] pt-4" onsubmit={(event) => { event.preventDefault(); handleRequestChanges(); }}>
							<textarea
								class="min-h-[76px] resize-y rounded bg-[#0f0f0d] px-3 py-2 text-sm text-[#eae9e4] outline outline-1 outline-[#2a2a28] placeholder:text-[#5f5b52] focus:outline-[#4a4942]"
								placeholder="Explain what needs to change..."
								bind:value={changeReason}
							></textarea>
							<div class="flex justify-end">
								<button
									type="submit"
									class="rounded bg-[#2a2a28] px-3 py-1.5 text-xs font-medium text-[#eae9e4] hover:bg-[#3a3a36] disabled:opacity-60"
									disabled={reviewBusy || !changeReason.trim()}
								>
									{reviewBusy ? 'Sending...' : 'Request changes'}
								</button>
							</div>
						</form>
					{/if}
				</div>

				{#if detail.child_workspaces.length}
					<div class="rounded border border-[#2a2a28] bg-[#141412] p-4">
						<h4 class="mb-3 text-xs font-semibold uppercase tracking-wide text-[#6f6b5f]">Child workspaces</h4>
						<div class="grid gap-1">
							{#each detail.child_workspaces as child}
								<button
									class="rounded bg-[#0f0f0d] px-2.5 py-1.5 text-left text-sm text-[#eae9e4] hover:bg-[#1a1a18]"
									onclick={() => goto(`/${tenant}/${project}/workspaces/${child}`)}
								>
									{child}
								</button>
							{/each}
						</div>
					</div>
				{/if}

				<div class="rounded border border-[#2a2a28] bg-[#141412] p-4">
					<h4 class="mb-3 text-xs font-semibold uppercase tracking-wide text-[#6f6b5f]">History</h4>
					<div class="relative grid gap-0">
						<div class="absolute left-[15px] top-0 bottom-0 w-px bg-[#2a2a28]"></div>
						{#each detail.history as entry}
							<button
								class="relative flex w-full items-start gap-2 py-1.5 text-left hover:opacity-80"
								onclick={() => goto(`/${tenant}/${project}/history/${entry.id}`)}
							>
								<div class="relative z-10 flex h-[22px] w-[22px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#2a2a28] text-[8px] font-medium text-[#eae9e4]">
									{#if entry.author_profile?.avatar_url}
										<img src={entry.author_profile.avatar_url} alt="" class="h-full w-full object-cover" />
									{:else}
										{userInitials(entry.author, entry.author_profile)}
									{/if}
								</div>
								<div class="min-w-0 flex-1">
									<div class="flex flex-wrap items-center gap-1.5 text-xs text-[#eae9e4]">
										<span>{historyMessage(entry)}</span>
										{#if entry.agent}
											<span class="rounded bg-[#1e1e1c] px-1 py-0.5 text-[9px] text-[#a09d94]">{entry.agent}</span>
										{/if}
										{#if entry.signature}
											<span class="rounded border border-[#25462a] bg-[#142018] px-1 py-0.5 text-[9px] text-[#7cb97c]">signed</span>
										{/if}
									</div>
									<div class="text-[10px] text-[#6f6b5f]">{userDisplayName(entry.author, entry.author_profile)} · {new Date(entry.timestamp).toLocaleString()}</div>
								</div>
							</button>
						{:else}
							<p class="py-4 text-center text-xs text-[#6f6b5f]">No history yet.</p>
						{/each}
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}
