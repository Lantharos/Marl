<script lang="ts">
	import type { HistoryEntry, ReviewComment } from '$lib/api';
	import { highlightCode } from '$lib/codeHighlight';
	import { renderFileDiffHunks, type DiffHunk, type DiffRow } from '$lib/diff';
	import { userDisplayName } from '$lib/identity';
	import ReviewThread from './ReviewThread.svelte';
	import MessageSquare from 'lucide-svelte/icons/message-square';
	import Plus from 'lucide-svelte/icons/plus';
	import ChevronDown from 'lucide-svelte/icons/chevron-down';
	import Spinner from './Spinner.svelte';

	type ReviewLineSide = 'old' | 'new';
	type ActiveReviewRange = { file: string; startLine: number; endLine: number; side?: ReviewLineSide };

	let {
		path,
		oldText,
		newText,
		entry = null,
		reviewComments = [],
		activeRange = null,
		readonly = false,
		onLineComment = null,
		onSubmitInline = null,
		onCancelInline = null,
		onUpdateComment = null,
		onDeleteComment = null,
		onResolveComment = null,
		currentUser = null,
		canMaintain = false,
		viewMode = 'inline',
		loading = false,
		viewed = false,
		collapsed = false,
		onToggleCollapsed = null,
		onToggleViewed = null
	}: {
		path: string;
		oldText: string | null;
		newText: string | null;
		entry?: HistoryEntry | null;
		reviewComments?: ReviewComment[];
		activeRange?: ActiveReviewRange | null;
		readonly?: boolean;
		onLineComment?: ((startLine: number, endLine: number, side: ReviewLineSide) => void) | null;
		onSubmitInline?: ((body: string) => Promise<void> | void) | null;
		onCancelInline?: (() => void) | null;
		onUpdateComment?: ((comment: ReviewComment, body: string) => Promise<void> | void) | null;
		onDeleteComment?: ((comment: ReviewComment) => Promise<void> | void) | null;
		onResolveComment?: ((comment: ReviewComment) => Promise<void> | void) | null;
		currentUser?: string | null;
		canMaintain?: boolean;
		viewMode?: 'inline' | 'split';
		loading?: boolean;
		viewed?: boolean;
		collapsed?: boolean;
		onToggleCollapsed?: (() => void) | null;
		onToggleViewed?: (() => void) | null;
	} = $props();

	const hunks = $derived(renderFileDiffHunks(oldText, newText));
	let expandedBefore = $state<Record<string, boolean>>({});
	let expandedAfter = $state<Record<string, boolean>>({});
	let dragStart = $state<number | null>(null);
	let dragEnd = $state<number | null>(null);
	let dragSide = $state<ReviewLineSide | null>(null);
	let fileComposerOpen = $state(false);
	const fileLevelComments = $derived(reviewComments.filter((comment) => comment.target_type === 'file' || (!comment.line && !comment.start_line && !comment.end_line)));

	function rowClass(kind: DiffRow['kind'], line: number | null, side: ReviewLineSide) {
		const selected = lineInActiveRange(line, side) || selectionActive(line, side) || composerActive(line, side);
		const commented = lineInCommentRange(line, side);
		if (selected) return 'bg-[#2f2a1c] shadow-[inset_3px_0_0_#d9a66c] text-[#f0d69a]';
		switch (kind) {
			case 'add':
				return `${commented ? 'bg-[#18351f] shadow-[inset_2px_0_0_#4c8f55]' : 'bg-[#122016]'} text-[#bfe8c2]`;
			case 'remove':
				return `${commented ? 'bg-[#3a1d1a] shadow-[inset_2px_0_0_#9f493d]' : 'bg-[#241513]'} text-[#e6b8ae]`;
			default:
				return `${commented ? 'bg-[#1d1d1a] shadow-[inset_2px_0_0_#8c887e]' : ''} text-[#d8d5ca]`;
		}
	}

	function marker(kind: DiffRow['kind']) {
		switch (kind) {
			case 'add':
				return '+';
			case 'remove':
				return '-';
			default:
				return ' ';
		}
	}

	function lineKey(row: DiffRow, index: number) {
		return `${row.oldLine ?? ''}-${row.newLine ?? ''}-${index}`;
	}

	function visibleBefore(hunk: DiffHunk) {
		return expandedBefore[hunk.id] ? hunk.before : hunk.before.slice(-3);
	}

	function visibleAfter(hunk: DiffHunk) {
		return expandedAfter[hunk.id] ? hunk.after : hunk.after.slice(0, 3);
	}

	function beginSelection(event: PointerEvent, line: number, side: ReviewLineSide) {
		if (!onLineComment || readonly) return;
		event.preventDefault();
		event.stopPropagation();
		dragStart = line;
		dragEnd = line;
		dragSide = side;
	}

	function extendSelection(line: number | null, side: ReviewLineSide) {
		if (dragStart === null || line === null || dragSide !== side) return;
		dragEnd = line;
	}

	function finishSelection() {
		if (dragStart === null || dragEnd === null || dragSide === null) return;
		const start = Math.min(dragStart, dragEnd);
		const end = Math.max(dragStart, dragEnd);
		const side = dragSide;
		dragStart = null;
		dragEnd = null;
		dragSide = null;
		onLineComment?.(start, end, side);
	}

	function commentEndLine(comment: ReviewComment) {
		return Number(comment.end_line ?? comment.line ?? comment.start_line ?? 0);
	}

	function commentStartLine(comment: ReviewComment) {
		return Number(comment.start_line ?? comment.line ?? comment.end_line ?? 0);
	}

	function commentSide(comment: ReviewComment): ReviewLineSide {
		return comment.side === 'old' ? 'old' : 'new';
	}

	function commentsForLine(line: number, side: ReviewLineSide) {
		return reviewComments.filter((comment) => commentEndLine(comment) === line && commentSide(comment) === side);
	}

	function lineInCommentRange(line: number | null, side: ReviewLineSide) {
		if (line === null) return false;
		return reviewComments.some((comment) => {
			const start = commentStartLine(comment);
			const end = commentEndLine(comment);
			return commentSide(comment) === side && start > 0 && end > 0 && line >= Math.min(start, end) && line <= Math.max(start, end);
		});
	}

	function selectionActive(line: number | null, side: ReviewLineSide) {
		if (line === null || dragStart === null || dragEnd === null || dragSide !== side) return false;
		const start = Math.min(dragStart, dragEnd);
		const end = Math.max(dragStart, dragEnd);
		return line >= start && line <= end;
	}

	function lineInActiveRange(line: number | null, side: ReviewLineSide) {
		if (line === null || activeRange?.file !== path) return false;
		return (activeRange.side ?? 'new') === side && line >= Math.min(activeRange.startLine, activeRange.endLine) && line <= Math.max(activeRange.startLine, activeRange.endLine);
	}

	function composerActive(line: number | null, side: ReviewLineSide) {
		return Boolean(line && activeRange?.file === path && (activeRange.side ?? 'new') === side && activeRange.endLine === line);
	}

	function rangeTitle(startLine: number, endLine: number) {
		return startLine === endLine ? `Line ${startLine}` : `Lines ${startLine}-${endLine}`;
	}

	function commentThreadTitle(comments: ReviewComment[]) {
		const first = comments[0];
		if (!first) return '';
		return rangeTitle(commentStartLine(first), commentEndLine(first));
	}

	async function submitFileComment(body: string) {
		await onSubmitInline?.(body);
		fileComposerOpen = false;
	}
</script>

<svelte:window onpointerup={finishSelection} />

<div class="overflow-hidden border border-[#2a2a28] bg-[#0f0f0d] font-mono text-[12px] leading-5">
	<div class="flex flex-wrap items-center gap-2 border-b border-[#2a2a28] bg-[#141412] px-3 py-2 text-xs text-[#a09d94]">
		{#if onToggleCollapsed}
			<button type="button" class="grid h-5 w-5 place-items-center text-[#8c887e] hover:text-[#eae9e4]" aria-label={collapsed ? 'Expand file' : 'Collapse file'} aria-expanded={!collapsed} onclick={onToggleCollapsed}>
				<ChevronDown class="h-3.5 w-3.5 transition {collapsed ? '-rotate-90' : ''}" />
			</button>
		{/if}
		<span class="min-w-0 flex-1 truncate">{path}</span>
		{#if entry?.agent}
			<span class="rounded bg-[#1e1e1c] px-1.5 py-0.5 text-[10px] text-[#a09d94]">{entry.agent}{entry.model ? ` ${entry.model}` : ''}</span>
		{/if}
		{#if entry?.signature}
			<span class="rounded border border-[#25462a] bg-[#142018] px-1.5 py-0.5 text-[10px] text-[#7cb97c]">signed</span>
		{:else if entry?.snapshot_id}
			<span class="rounded border border-[#2a2a28] bg-[#10100e] px-1.5 py-0.5 text-[10px] text-[#6f6b5f]">unsigned</span>
		{/if}
		{#if entry}
			<span class="text-[10px] text-[#6f6b5f]">{userDisplayName(entry.author, entry.author_profile)}</span>
		{/if}
		{#if onSubmitInline && !readonly}
			<button type="button" class="flex h-6 items-center gap-1 bg-[#242420] px-2 text-[11px] text-[#d8d5ca] hover:bg-[#2f2f2b]" onclick={() => (fileComposerOpen = !fileComposerOpen)}>
				<MessageSquare class="h-3 w-3" />Comment on file
			</button>
		{/if}
		{#if onToggleViewed}
			<button type="button" class="flex h-6 items-center gap-1 border border-[#3a3a36] bg-[#1a1a18] px-2 text-[11px] {viewed ? 'text-[#eae9e4]' : 'text-[#8c887e] hover:text-[#eae9e4]'}" onclick={onToggleViewed}>
				<span class="grid h-3.5 w-3.5 place-items-center border border-[#6f6b5f] text-[10px] leading-none">{viewed ? '✓' : ''}</span>
				Viewed
			</button>
		{/if}
	</div>
	{#if !collapsed && (fileLevelComments.length || fileComposerOpen)}
		<div class="border-b border-[#242420] bg-[#10100e] px-3 py-3 font-sans">
			<ReviewThread
				title="File conversation"
				comments={fileLevelComments}
				onSubmit={submitFileComment}
				onCancel={fileComposerOpen ? () => (fileComposerOpen = false) : null}
				onUpdate={onUpdateComment}
				onDelete={onDeleteComment}
				onResolve={onResolveComment}
				readonly={!fileComposerOpen}
				showEmpty={fileComposerOpen}
				{currentUser}
				{canMaintain}
			/>
		</div>
	{/if}
	{#if collapsed}
		<div class="px-3 py-2 font-sans text-xs text-[#6f6b5f]">{hunks.length} changed {hunks.length === 1 ? 'hunk' : 'hunks'} hidden.</div>
	{:else if loading}
		<div class="grid min-h-[180px] place-items-center font-sans">
			<Spinner />
		</div>
	{:else if hunks.length && viewMode === 'split'}
		{#each hunks as hunk}
			{#each hunk.rows as row, index (lineKey(row, index))}
				{@render SplitRowView(row)}
			{/each}
		{/each}
	{:else if hunks.length}
		{#each hunks as hunk}
			{#if hunk.hiddenBefore > 0 || hunk.before.length > 3}
				<button
					type="button"
					class="grid w-full grid-cols-[72px_20px_1fr] border-b border-[#1d1d1a] bg-[#10100e] text-left text-[#6f6b5f] hover:bg-[#171714]"
					onclick={() => (expandedBefore[hunk.id] = !expandedBefore[hunk.id])}
				>
					<span class="px-2 text-right">{hunk.hiddenBefore > 0 ? hunk.hiddenBefore : hunk.before.length - 3}</span>
					<span class="text-center">{expandedBefore[hunk.id] ? '-' : '+'}</span>
					<span class="px-2">lines above</span>
				</button>
			{/if}
			{#each visibleBefore(hunk) as row, index (lineKey(row, index))}
				{@render DiffRowView(row)}
			{/each}
			{#each hunk.rows as row, index (lineKey(row, index))}
				{@render DiffRowView(row)}
			{/each}
			{#each visibleAfter(hunk) as row, index (lineKey(row, index))}
				{@render DiffRowView(row)}
			{/each}
			{#if hunk.hiddenAfter > 0 || hunk.after.length > 3}
				<button
					type="button"
					class="grid w-full grid-cols-[72px_20px_1fr] border-b border-[#1d1d1a] bg-[#10100e] text-left text-[#6f6b5f] hover:bg-[#171714]"
					onclick={() => (expandedAfter[hunk.id] = !expandedAfter[hunk.id])}
				>
					<span class="px-2 text-right">{hunk.hiddenAfter > 0 ? hunk.hiddenAfter : hunk.after.length - 3}</span>
					<span class="text-center">{expandedAfter[hunk.id] ? '-' : '+'}</span>
					<span class="px-2">lines below</span>
				</button>
			{/if}
		{/each}
	{:else}
		<div class="grid min-h-[180px] place-items-center text-sm text-[#6f6b5f]">No changes.</div>
	{/if}
</div>

{#snippet DiffRowView(row: DiffRow)}
	{@const reviewLine = row.newLine ?? row.oldLine ?? null}
	{@const reviewSide = row.newLine === null && row.oldLine !== null ? 'old' : 'new'}
	{@const rowComments = reviewLine ? commentsForLine(reviewLine, reviewSide) : []}
	<div
		role="presentation"
		class="group grid grid-cols-[72px_20px_1fr] border-b border-[#1d1d1a] {rowClass(row.kind, reviewLine, reviewSide)}"
		onpointerenter={() => extendSelection(reviewLine, reviewSide)}
	>
		<div class="flex select-none items-center justify-end gap-1 border-r border-[#2a2a28] px-2 text-right text-[#6f6b5f]">
			{#if onLineComment && reviewLine && !readonly}
				<button
					type="button"
					class="flex h-4 w-4 items-center justify-center rounded-sm bg-[#1d4f8f] text-[#eaf4ff] opacity-0 hover:bg-[#2f6eb8] group-hover:opacity-100 {composerActive(reviewLine, reviewSide) ? 'opacity-100' : ''}"
					aria-label={`Comment on line ${reviewLine}`}
					onpointerdown={(event) => beginSelection(event, reviewLine, reviewSide)}
				>
					<Plus class="h-3 w-3" />
				</button>
			{/if}
			<span>{reviewLine ?? ''}</span>
		</div>
		<div class="select-none text-center text-[#8a8578]">{marker(row.kind)}</div>
		<pre class="min-w-0 overflow-x-auto px-2 whitespace-pre-wrap break-words">{@html highlightCode(row.text || ' ')}</pre>
	</div>
	{#if reviewLine && (rowComments.length || composerActive(reviewLine, reviewSide))}
		<div class="grid grid-cols-[72px_20px_1fr] border-b border-[#242420] bg-[#10100e]">
			<div class="border-r border-[#2a2a28]"></div>
			<div></div>
			<div class="max-w-[760px] px-2 py-3">
				<ReviewThread
					title={composerActive(reviewLine, reviewSide) && activeRange ? rangeTitle(activeRange.startLine, activeRange.endLine) : commentThreadTitle(rowComments)}
					comments={rowComments}
					onSubmit={(body: string) => onSubmitInline?.(body)}
					onCancel={composerActive(reviewLine, reviewSide) ? onCancelInline : null}
					onUpdate={onUpdateComment}
					onDelete={onDeleteComment}
					onResolve={onResolveComment}
					readonly={!composerActive(reviewLine, reviewSide)}
					showEmpty={Boolean(composerActive(reviewLine, reviewSide))}
					{currentUser}
					{canMaintain}
				/>
			</div>
		</div>
	{/if}
{/snippet}

{#snippet SplitRowView(row: DiffRow)}
	{@const oldLine = row.oldLine}
	{@const newLine = row.newLine}
	{@const oldComments = oldLine ? commentsForLine(oldLine, 'old') : []}
	{@const newComments = newLine ? commentsForLine(newLine, 'new') : []}
	<div class="grid grid-cols-[72px_1fr_72px_1fr] border-b border-[#1d1d1a]">
		{@render SplitCell(oldLine, row.kind === 'add' ? '' : row.text, row.kind === 'remove' ? 'remove' : 'context', 'old')}
		{@render SplitCell(newLine, row.kind === 'remove' ? '' : row.text, row.kind === 'add' ? 'add' : 'context', 'new')}
	</div>
	{#if oldLine && (oldComments.length || composerActive(oldLine, 'old'))}
		{@render SplitThread(oldLine, 'old', oldComments)}
	{/if}
	{#if newLine && (newComments.length || composerActive(newLine, 'new'))}
		{@render SplitThread(newLine, 'new', newComments)}
	{/if}
{/snippet}

{#snippet SplitCell(line: number | null, text: string, kind: DiffRow['kind'], side: ReviewLineSide)}
	{@const sign = kind === 'add' ? '+' : kind === 'remove' ? '-' : ' '}
	<div role="presentation" class="group flex select-none items-center justify-end gap-1 border-r border-[#2a2a28] px-2 text-right text-[#6f6b5f] {rowClass(kind, line, side)}" onpointerenter={() => extendSelection(line, side)}>
		{#if onLineComment && line && !readonly}
			<button
				type="button"
				class="flex h-4 w-4 items-center justify-center rounded-sm bg-[#1d4f8f] text-[#eaf4ff] opacity-0 hover:bg-[#2f6eb8] hover:opacity-100 group-hover:opacity-100 {composerActive(line, side) ? 'opacity-100' : ''}"
				aria-label={`Comment on line ${line}`}
				onpointerdown={(event) => beginSelection(event, line, side)}
			>
				<Plus class="h-3 w-3" />
			</button>
		{/if}
		<span>{line ?? ''}</span>
	</div>
	<pre class="min-w-0 overflow-x-auto px-2 whitespace-pre-wrap break-words {rowClass(kind, line, side)}">{sign} {@html highlightCode(text || ' ')}</pre>
{/snippet}

{#snippet SplitThread(line: number, side: ReviewLineSide, comments: ReviewComment[])}
	<div class="grid grid-cols-[72px_minmax(0,1fr)] border-b border-[#242420] bg-[#10100e]">
		<div class="border-r border-[#2a2a28]"></div>
		<div class="px-2 py-3">
			<ReviewThread title={composerActive(line, side) && activeRange ? rangeTitle(activeRange.startLine, activeRange.endLine) : commentThreadTitle(comments)} comments={comments} onSubmit={(body: string) => onSubmitInline?.(body)} onCancel={composerActive(line, side) ? onCancelInline : null} onUpdate={onUpdateComment} onDelete={onDeleteComment} onResolve={onResolveComment} readonly={!composerActive(line, side)} showEmpty={Boolean(composerActive(line, side))} {currentUser} {canMaintain} />
		</div>
	</div>
{/snippet}
