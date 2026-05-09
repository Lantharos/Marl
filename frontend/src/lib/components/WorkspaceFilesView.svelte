<script lang="ts">
	import { tick } from 'svelte';
	import type { ChangedFile, ReviewComment } from '$lib/api';
	import { downloadObjectText } from '$lib/objectApi';
	import ChangedFilesTree from '$lib/components/ChangedFilesTree.svelte';
	import FileDiffCard from '$lib/components/FileDiffCard.svelte';
	import InfiniteLoader from '$lib/components/InfiniteLoader.svelte';

	type DiffMode = 'inline' | 'split';
	type ReviewLineSide = 'old' | 'new';
	type ActiveReviewRange = { file: string; startLine: number; endLine: number; side?: ReviewLineSide };
	type FileTextState = { oldText: string | null; newText: string | null; loading: boolean; error?: string };

	let {
		tenant,
		project,
		changedFiles,
		expectedFileCount,
		previewError,
		reviewKey,
		pendingReviewCount = 0,
		selectedPath,
		commentCountsByFile,
		fileThreads,
		selectedReviewRange,
		diffMode,
		currentUser,
		canMaintain,
		readonly,
		fillSidebar = false,
		showReviewFocus = true,
		showViewedState = true,
		onSelectPath,
		onDiffModeChange,
		onOpenConversation,
		onOpenSubmitReview,
		onLineComment,
		onSubmitFileComment,
		onCancelInline,
		onUpdateComment,
		onDeleteComment,
		onResolveComment
	}: {
		tenant: string;
		project: string;
		changedFiles: ChangedFile[];
		expectedFileCount: number;
		previewError: string;
		reviewKey: string;
		pendingReviewCount?: number;
		selectedPath: string;
		commentCountsByFile: Record<string, number>;
		fileThreads: ReviewComment[];
		selectedReviewRange: ActiveReviewRange | null;
		diffMode: DiffMode;
		currentUser: string | null;
		canMaintain: boolean;
		readonly: boolean;
		fillSidebar?: boolean;
		showReviewFocus?: boolean;
		showViewedState?: boolean;
		onSelectPath: (path: string) => void;
		onDiffModeChange: (mode: DiffMode) => void;
		onOpenConversation: (comment: ReviewComment) => void;
		onOpenSubmitReview: () => void;
		onLineComment: (path: string, startLine: number, endLine: number, side: ReviewLineSide) => void;
		onSubmitFileComment: (path: string, body: string) => Promise<void> | void;
		onCancelInline: () => void;
		onUpdateComment: (comment: ReviewComment, body: string) => Promise<void> | void;
		onDeleteComment: (comment: ReviewComment) => Promise<void> | void;
		onResolveComment: (comment: ReviewComment) => Promise<void> | void;
	} = $props();

	const chunkSize = 8;
	const jumpPadding = 2;

	let viewedPaths = $state<string[]>([]);
	let loadedReviewKey = $state('');
	let conversationFilter = $state<'open' | 'all'>('open');
	let visibleStart = $state(0);
	let visibleEnd = $state(chunkSize);
	let fileText = $state<Record<string, FileTextState>>({});
	let lastScrolledPath = $state('');
	let collapsedPaths = $state<string[]>([]);

	const sortedThreads = $derived([...fileThreads].sort((a, b) => Number(a.state === 'resolved') - Number(b.state === 'resolved') || new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
	const visibleThreads = $derived(conversationFilter === 'open' ? sortedThreads.filter((comment) => comment.state !== 'resolved') : sortedThreads);
	const openCount = $derived(fileThreads.filter((comment) => comment.state !== 'resolved').length);
	const visibleFileCount = $derived(changedFiles.length || expectedFileCount);
	const viewedCount = $derived(viewedPaths.filter((path) => changedFiles.some((file) => file.path === path)).length);
	const focusFiles = $derived(changedFiles.map((file) => ({ file, label: focusLabel(file.path) })).filter((item) => item.label));
	const visibleFiles = $derived(changedFiles.slice(visibleStart, visibleEnd));
	const hasPrevious = $derived(visibleStart > 0);
	const hasMore = $derived(visibleEnd < changedFiles.length);

	$effect(() => {
		if (!reviewKey || loadedReviewKey === reviewKey) return;
		loadedReviewKey = reviewKey;
		visibleStart = 0;
		visibleEnd = chunkSize;
		fileText = {};
		lastScrolledPath = '';
		collapsedPaths = [];
		if (!showViewedState) {
			viewedPaths = [];
			return;
		}
		try {
			const stored = localStorage.getItem(`sty:viewed-files:${reviewKey}`);
			viewedPaths = stored ? JSON.parse(stored) : [];
		} catch {
			viewedPaths = [];
		}
	});

	$effect(() => {
		const valid = new Set(changedFiles.map((file) => file.path));
		const next = viewedPaths.filter((path) => valid.has(path));
		if (next.length !== viewedPaths.length) viewedPaths = next;
		if (visibleStart >= changedFiles.length) visibleStart = Math.max(0, changedFiles.length - chunkSize);
		if (visibleEnd <= visibleStart) visibleEnd = Math.min(changedFiles.length, visibleStart + chunkSize);
	});

	$effect(() => {
		if (!showViewedState || !reviewKey || loadedReviewKey !== reviewKey) return;
		localStorage.setItem(`sty:viewed-files:${reviewKey}`, JSON.stringify(viewedPaths));
	});

	$effect(() => {
		const missing = visibleFiles.filter((file) => !fileText[file.path]);
		if (!missing.length) return;
		loadVisibleFiles(missing);
	});

	$effect(() => {
		if (!selectedPath || selectedPath === lastScrolledPath) return;
		lastScrolledPath = selectedPath;
		revealPath(selectedPath);
	});

	async function loadVisibleFiles(files: ChangedFile[]) {
		fileText = {
			...fileText,
			...Object.fromEntries(files.map((file) => [file.path, { oldText: null, newText: null, loading: true } satisfies FileTextState]))
		};
		await Promise.all(files.map((file) => loadFile(file)));
	}

	async function loadFile(file: ChangedFile) {
		try {
			const [oldText, newText] = await Promise.all([
				file.change_type === 'added' ? Promise.resolve(null) : loadBlobText(file.old_id),
				file.change_type === 'deleted' ? Promise.resolve(null) : loadBlobText(file.new_id)
			]);
			fileText = { ...fileText, [file.path]: { oldText, newText, loading: false } };
		} catch (error) {
			fileText = {
				...fileText,
				[file.path]: {
					oldText: null,
					newText: null,
					loading: false,
					error: error instanceof Error ? error.message : 'Failed to load diff'
				}
			};
		}
	}

	async function loadBlobText(id: string | null) {
		if (!id) return null;
		const text = await downloadObjectText(tenant, project, id);
		if (text === null) throw new Error('Failed to load file contents');
		return text;
	}

	function lineLabel(comment: ReviewComment) {
		const line = comment.start_line ?? comment.line;
		return line ? `line ${line}` : 'file';
	}

	function viewedPath(path: string) {
		return viewedPaths.includes(path);
	}

	function toggleViewed(path: string) {
		viewedPaths = viewedPath(path) ? viewedPaths.filter((item) => item !== path) : [...viewedPaths, path];
	}

	function collapsedPath(path: string) {
		return collapsedPaths.includes(path);
	}

	function toggleCollapsed(path: string) {
		collapsedPaths = collapsedPath(path) ? collapsedPaths.filter((item) => item !== path) : [...collapsedPaths, path];
	}

	function commentsForPath(path: string) {
		return fileThreads.filter((comment) => comment.file === path);
	}

	function activeRangeForPath(path: string) {
		return selectedReviewRange?.file === path ? selectedReviewRange : null;
	}

	function fileAnchor(path: string) {
		return `file-${encodeURIComponent(path)}`;
	}

	async function jumpToPath(path: string) {
		onSelectPath(path);
		lastScrolledPath = path;
		await revealPath(path);
	}

	async function revealPath(path: string) {
		const index = changedFiles.findIndex((file) => file.path === path);
		if (index < 0) return;
		if (index < visibleStart || index >= visibleEnd) {
			const start = Math.max(0, Math.min(index - jumpPadding, changedFiles.length - chunkSize));
			visibleStart = start;
			visibleEnd = Math.min(changedFiles.length, Math.max(index + 1, start + chunkSize));
		}
		await tick();
		await new Promise((resolve) => requestAnimationFrame(resolve));
		document.getElementById(fileAnchor(path))?.scrollIntoView({ block: 'start', behavior: 'smooth' });
	}

	function loadMore() {
		visibleEnd = Math.min(visibleEnd + chunkSize, changedFiles.length);
	}

	function loadPrevious() {
		visibleStart = Math.max(0, visibleStart - chunkSize);
	}

	function focusLabel(path: string) {
		const lower = path.toLowerCase();
		if (lower.includes('migration') || lower.endsWith('.sql') || lower.includes('/db/')) return 'data';
		if (lower.includes('auth') || lower.includes('oauth') || lower.includes('session') || lower.includes('permission')) return 'auth';
		if (lower.includes('billing') || lower.includes('payment') || lower.includes('stripe')) return 'billing';
		if (lower.includes('/api/') || lower.includes('protocol') || lower.includes('schema')) return 'api';
		if (lower.includes('wrangler') || lower.includes('deploy') || lower.includes('.env') || lower.includes('docker')) return 'deploy';
		return '';
	}
</script>

<div class="mx-[calc(50%-50vw)] bg-[#0f0f0d] px-6 pb-8">
	<div class="sticky top-0 z-20 -mx-6 border-b border-[#2a2a28] bg-[#0f0f0d] px-6 py-3">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div class="text-sm text-[#8c887e]">
				{visibleFileCount} changed {visibleFileCount === 1 ? 'file' : 'files'}
				{#if showViewedState && changedFiles.length}
					<span> · {viewedCount}/{changedFiles.length} viewed</span>
				{/if}
				{#if openCount}
					<span> · {openCount} open file {openCount === 1 ? 'conversation' : 'conversations'}</span>
				{/if}
			</div>
			<div class="flex flex-wrap gap-2">
				<div class="flex bg-[#141412] p-0.5">
					{#each [['inline', 'Inline'], ['split', 'Split']] as mode (mode[0])}
						<button class="px-2.5 py-1 text-xs {diffMode === mode[0] ? 'bg-[#eae9e4] text-[#0f0f0d]' : 'text-[#8c887e] hover:text-[#eae9e4]'}" onclick={() => onDiffModeChange(mode[0] as DiffMode)}>{mode[1]}</button>
					{/each}
				</div>
				{#if pendingReviewCount > 0}
					<button class="bg-[#2d7d3a] px-3 py-1 text-xs font-medium text-white hover:bg-[#348f43]" onclick={onOpenSubmitReview}>
						Submit {pendingReviewCount} {pendingReviewCount === 1 ? 'comment' : 'comments'}
					</button>
				{/if}
			</div>
		</div>
	</div>

	{#if previewError}
		<div class="my-3 bg-[#2b1b18] px-3 py-2 text-sm text-[#e0b0a7]">{previewError}</div>
	{/if}

	<div class="grid gap-4 pt-4 lg:grid-cols-[300px_minmax(0,1fr)]">
		<aside class="sticky border border-[#2a2a28] bg-[#0f0f0d] p-2 {fillSidebar ? 'top-[82px] flex h-[calc(100vh-146px)] flex-col overflow-hidden' : 'top-[68px] h-fit max-h-[calc(100vh-88px)] overflow-auto'}">
			{#if showReviewFocus && focusFiles.length}
				<div class="mb-3 border-b border-[#252522] pb-3">
					<div class="mb-2 text-xs font-medium text-[#eae9e4]">Review focus</div>
					<div class="grid gap-1">
						{#each focusFiles.slice(0, 6) as item (item.file.path)}
							<button class="flex min-w-0 items-center gap-2 px-1.5 py-1 text-left text-xs hover:bg-[#1a1a18]" onclick={() => jumpToPath(item.file.path)}>
								<span class="w-12 shrink-0 text-[#d9a66c]">{item.label}</span>
								<span class="truncate text-[#d8d5ca]">{item.file.path}</span>
							</button>
						{/each}
					</div>
				</div>
			{/if}
			<div class={fillSidebar ? 'min-h-0 flex-1' : ''}>
				<ChangedFilesTree {changedFiles} {selectedPath} {commentCountsByFile} fill={fillSidebar} maxHeight={fillSidebar ? 'none' : '45vh'} minHeight={fillSidebar ? '0' : '220px'} onSelect={jumpToPath} />
			</div>
			{#if sortedThreads.length}
				<div class="mt-3 border-t border-[#252522] pt-3">
					<div class="mb-2 flex items-center justify-between text-xs">
						<span class="font-medium text-[#eae9e4]">Conversations</span>
						<div class="flex bg-[#141412] p-0.5">
							{#each [['open', openCount], ['all', sortedThreads.length]] as item (item[0])}
								<button class="px-1.5 py-0.5 text-[11px] {conversationFilter === item[0] ? 'bg-[#eae9e4] text-[#0f0f0d]' : 'text-[#6f6b5f] hover:text-[#eae9e4]'}" onclick={() => (conversationFilter = item[0] as 'open' | 'all')}>{item[0]} {item[1]}</button>
							{/each}
						</div>
					</div>
					<div class="grid gap-1">
						{#each visibleThreads as comment (comment.id)}
							<button class="grid gap-0.5 px-1.5 py-1.5 text-left hover:bg-[#1a1a18]" onclick={() => onOpenConversation(comment)}>
								<div class="flex min-w-0 items-center gap-1.5 text-xs">
									<span class="h-1.5 w-1.5 shrink-0 {comment.state === 'resolved' ? 'bg-[#6f6b5f]' : 'bg-[#d9a66c]'}"></span>
									<span class="min-w-0 truncate text-[#d8d5ca]">{comment.file}</span>
									<span class="shrink-0 text-[#6f6b5f]">{lineLabel(comment)}</span>
								</div>
								<div class="truncate pl-3 text-[11px] text-[#6f6b5f]">{comment.body}</div>
							</button>
						{:else}
							<div class="px-1.5 py-1 text-xs text-[#6f6b5f]">No open conversations.</div>
						{/each}
					</div>
				</div>
			{/if}
		</aside>

		<div class="grid min-w-0 gap-4">
			{#if hasPrevious}
				<button class="border border-[#2a2a28] px-3 py-2 text-sm text-[#8c887e] hover:text-[#eae9e4]" onclick={loadPrevious}>
					Show {Math.min(chunkSize, visibleStart)} earlier {Math.min(chunkSize, visibleStart) === 1 ? 'file' : 'files'}
				</button>
			{/if}
			{#each visibleFiles as file (file.path)}
				{@const text = fileText[file.path]}
				<section id={fileAnchor(file.path)} class="scroll-mt-20">
					<FileDiffCard
						path={file.path}
						oldText={text?.oldText ?? null}
						newText={text?.newText ?? null}
						reviewComments={commentsForPath(file.path)}
						activeRange={activeRangeForPath(file.path)}
						{readonly}
						onLineComment={(startLine, endLine, side) => onLineComment(file.path, startLine, endLine, side)}
						onSubmitInline={(body: string) => onSubmitFileComment(file.path, body)}
						onCancelInline={onCancelInline}
						onUpdateComment={onUpdateComment}
						onDeleteComment={onDeleteComment}
						onResolveComment={onResolveComment}
						viewMode={diffMode}
						{currentUser}
						{canMaintain}
						loading={text?.loading ?? true}
						viewed={viewedPath(file.path)}
						collapsed={collapsedPath(file.path)}
						onToggleCollapsed={() => toggleCollapsed(file.path)}
						onToggleViewed={showViewedState ? () => toggleViewed(file.path) : null}
					/>
					{#if text?.error}
						<div class="border-x border-b border-[#2a2a28] bg-[#2b1b18] px-3 py-2 text-sm text-[#e0b0a7]">{text.error}</div>
					{/if}
				</section>
			{:else}
				<div class="grid min-h-[360px] place-items-center border border-[#2a2a28] text-sm text-[#6f6b5f]">No file changes.</div>
			{/each}
			<InfiniteLoader active={hasMore} onVisible={loadMore} />
		</div>
	</div>
</div>
