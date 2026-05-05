<script lang="ts">
	import type { HistoryEntry, ReviewComment } from '$lib/api';
	import { highlightCode } from '$lib/codeHighlight';
	import { renderFileDiffHunks, type DiffHunk, type DiffRow } from '$lib/diff';
	import { userDisplayName } from '$lib/identity';
	import ReviewThread from './ReviewThread.svelte';
	import Plus from 'lucide-svelte/icons/plus';

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
		currentUser = null,
		canMaintain = false
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
		currentUser?: string | null;
		canMaintain?: boolean;
	} = $props();

	const hunks = $derived(renderFileDiffHunks(oldText, newText));
	let expandedBefore = $state<Record<string, boolean>>({});
	let expandedAfter = $state<Record<string, boolean>>({});
	let dragStart = $state<number | null>(null);
	let dragEnd = $state<number | null>(null);
	let dragSide = $state<ReviewLineSide | null>(null);

	function rowClass(kind: DiffRow['kind'], line: number | null, side: ReviewLineSide) {
		const selected = lineInActiveRange(line, side) || selectionActive(line, side) || composerActive(line, side);
		const commented = lineInCommentRange(line, side);
		switch (kind) {
			case 'add':
				return `${selected ? 'bg-[#1f5a2d] shadow-[inset_3px_0_0_#7cb97c]' : commented ? 'bg-[#18351f] shadow-[inset_2px_0_0_#4c8f55]' : 'bg-[#122016]'} text-[#bfe8c2]`;
			case 'remove':
				return `${selected ? 'bg-[#642a23] shadow-[inset_3px_0_0_#d96c5a]' : commented ? 'bg-[#3a1d1a] shadow-[inset_2px_0_0_#9f493d]' : 'bg-[#241513]'} text-[#e6b8ae]`;
			default:
				return `${selected ? 'bg-[#282722] shadow-[inset_3px_0_0_#d9a66c]' : commented ? 'bg-[#1d1d1a] shadow-[inset_2px_0_0_#8c887e]' : ''} text-[#d8d5ca]`;
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
</script>

<svelte:window onpointerup={finishSelection} />

<div class="h-full overflow-auto bg-[#141412] font-mono text-[12px] leading-5">
	<div class="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-[#2a2a28] bg-[#141412] px-3 py-2 text-xs text-[#a09d94]">
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
	</div>
	{#if hunks.length}
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
					readonly={!composerActive(reviewLine, reviewSide)}
					showEmpty={Boolean(composerActive(reviewLine, reviewSide))}
					{currentUser}
					{canMaintain}
				/>
			</div>
		</div>
	{/if}
{/snippet}
