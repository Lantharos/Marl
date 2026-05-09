<script lang="ts">
	import type { ProjectFile, ReviewComment } from '$lib/api';
	import { highlightCodeLines, languageLabelForPath } from '$lib/codeHighlight';
	import ReviewThread from '$lib/components/ReviewThread.svelte';
	import Plus from 'lucide-svelte/icons/plus';

	let {
		file,
		reviewComments = [],
		activeRange = null,
		readonly = false,
		onLineComment = null,
		onSubmitInline = null,
		onCancelInline = null
	}: {
		file: ProjectFile | null;
		reviewComments?: ReviewComment[];
		activeRange?: { file: string; startLine: number; endLine: number } | null;
		readonly?: boolean;
		onLineComment?: ((startLine: number, endLine: number) => void) | null;
		onSubmitInline?: ((body: string) => Promise<void> | void) | null;
		onCancelInline?: (() => void) | null;
	} = $props();

	const lines = $derived(file?.text?.split('\n') ?? []);
	const language = $derived(file ? languageLabelForPath(file.path) : 'plain');
	const fileSize = $derived(file?.text === null || file?.text === undefined ? '' : formatBytes(file.text.length));
	let dragStart = $state<number | null>(null);
	let dragEnd = $state<number | null>(null);
	let highlightedLines = $state<string[]>([]);
	let lineWrap = $state(false);
	let highlightRun = 0;

	$effect(() => {
		const current = file;
		if (!current || current.binary || current.text === null) {
			highlightedLines = [];
			return;
		}
		const run = ++highlightRun;
		highlightedLines = current.text.split('\n').map(escapeHtml);
		highlightCodeLines(current.text, current.path).then((next) => {
			if (run === highlightRun) highlightedLines = next;
		});
	});

	function beginSelection(event: PointerEvent, line: number) {
		if (!onLineComment || readonly) return;
		event.preventDefault();
		event.stopPropagation();
		dragStart = line;
		dragEnd = line;
	}

	function extendSelection(line: number) {
		if (dragStart === null) return;
		dragEnd = line;
	}

	function finishSelection() {
		if (dragStart === null || dragEnd === null) return;
		const start = Math.min(dragStart, dragEnd);
		const end = Math.max(dragStart, dragEnd);
		dragStart = null;
		dragEnd = null;
		onLineComment?.(start, end);
	}

	function commentEndLine(comment: ReviewComment) {
		return Number(comment.end_line ?? comment.line ?? comment.start_line ?? 0);
	}

	function commentStartLine(comment: ReviewComment) {
		return Number(comment.start_line ?? comment.line ?? comment.end_line ?? 0);
	}

	function commentsForLine(line: number) {
		return reviewComments.filter((comment) => commentEndLine(comment) === line);
	}

	function lineHasComment(line: number) {
		return commentsForLine(line).length > 0;
	}

	function lineInCommentRange(line: number) {
		return reviewComments.some((comment) => {
			const start = commentStartLine(comment);
			const end = commentEndLine(comment);
			return start > 0 && end > 0 && line >= Math.min(start, end) && line <= Math.max(start, end);
		});
	}

	function selectionActive(line: number) {
		if (dragStart === null || dragEnd === null) return false;
		const start = Math.min(dragStart, dragEnd);
		const end = Math.max(dragStart, dragEnd);
		return line >= start && line <= end;
	}

	function lineInActiveRange(line: number) {
		if (!file || activeRange?.file !== file.path) return false;
		return line >= Math.min(activeRange.startLine, activeRange.endLine) && line <= Math.max(activeRange.startLine, activeRange.endLine);
	}

	function composerActive(line: number) {
		return Boolean(file && activeRange?.file === file.path && activeRange.endLine === line);
	}

	function rangeTitle(startLine: number, endLine: number) {
		return startLine === endLine ? `Line ${startLine}` : `Lines ${startLine}-${endLine}`;
	}

	function commentThreadTitle(comments: ReviewComment[]) {
		const first = comments[0];
		if (!first) return '';
		return rangeTitle(commentStartLine(first), commentEndLine(first));
	}

	function formatBytes(value: number) {
		if (value < 1024) return `${value} B`;
		if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
		return `${(value / (1024 * 1024)).toFixed(1)} MB`;
	}

	function escapeHtml(value: string) {
		return value
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;')
			.replaceAll('"', '&quot;');
	}
</script>

<svelte:window onpointerup={finishSelection} />

{#if !file}
	<div class="grid min-h-[360px] place-items-center px-6 text-center text-sm text-[#6f6b5f]">
		No file selected.
	</div>
{:else if file.binary || file.text === null}
	<div class="grid min-h-[360px] place-items-center px-6 text-center text-sm text-[#6f6b5f]">
		This file is stored as binary content.
	</div>
{:else}
	<div class="flex h-full min-h-0 flex-col bg-[#0f0f0d]">
		<div class="flex shrink-0 items-center justify-between gap-3 border-b border-[#242420] bg-[#141412] px-4 py-2">
			<div class="min-w-0 truncate font-mono text-xs text-[#eae9e4]">{file.path}</div>
			<div class="flex shrink-0 items-center gap-2 text-[11px] text-[#6f6b5f]">
				<span>{language}</span>
				<span>{lines.length} {lines.length === 1 ? 'line' : 'lines'}</span>
				<span>{fileSize}</span>
				<button
					type="button"
					class="ml-1 text-[11px] {lineWrap ? 'text-[#d9a66c]' : 'text-[#6f6b5f] hover:text-[#a09d94]'}"
					onclick={() => (lineWrap = !lineWrap)}
				>
					wrap
				</button>
			</div>
		</div>
		<div class="min-h-0 flex-1 overflow-auto font-mono text-[12px] leading-5 text-[#d8d5ca] code-pane">
			<div class={lineWrap ? 'w-full min-w-0' : 'w-max min-w-full'}>
		{#each lines as line, index}
			{@const lineNumber = index + 1}
			{@const rowComments = commentsForLine(lineNumber)}
			<div
				role="presentation"
				class="group grid grid-cols-[64px_minmax(0,1fr)] hover:bg-[#171714] {lineInCommentRange(lineNumber) ? 'bg-[#132034]' : ''} {lineInActiveRange(lineNumber) ? 'bg-[#14263a]' : ''} {selectionActive(lineNumber) ? 'bg-[#14263a]' : ''} {composerActive(lineNumber) ? 'bg-[#172235]' : ''}"
				onpointerenter={() => extendSelection(lineNumber)}
			>
				<div class="flex select-none items-center justify-end gap-1 px-2 text-right text-[#5f5b52]">
					{#if onLineComment && !readonly}
						<button
							type="button"
							class="flex h-4 w-4 items-center justify-center rounded-sm bg-[#1d4f8f] text-[#eaf4ff] opacity-0 hover:bg-[#2f6eb8] group-hover:opacity-100 {lineHasComment(lineNumber) || composerActive(lineNumber) ? 'opacity-100' : ''}"
							aria-label={`Comment on line ${lineNumber}`}
							onpointerdown={(event) => beginSelection(event, lineNumber)}
						>
							<Plus class="h-3 w-3" />
						</button>
					{/if}
					<span>{lineNumber}</span>
				</div>
				<pre class="min-w-0 px-4 py-0 {lineWrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'}">{@html highlightedLines[index] || '&nbsp;'}</pre>
			</div>
			{#if rowComments.length || composerActive(lineNumber)}
				<div class="grid grid-cols-[64px_1fr] border-y border-[#242420] bg-[#10100e]">
					<div></div>
					<div class="max-w-[760px] px-3 py-3">
						<ReviewThread
							title={composerActive(lineNumber) && activeRange ? rangeTitle(activeRange.startLine, activeRange.endLine) : commentThreadTitle(rowComments)}
							comments={rowComments}
							onSubmit={(body: string) => onSubmitInline?.(body)}
							onCancel={composerActive(lineNumber) ? onCancelInline : null}
							readonly={!composerActive(lineNumber)}
							showEmpty={Boolean(composerActive(lineNumber))}
						/>
					</div>
				</div>
			{/if}
		{/each}
			</div>
		</div>
	</div>
{/if}

<style>
	:global(.code-pane .shj-syn-kwd),
	:global(.code-pane .shj-syn-class),
	:global(.code-pane .shj-syn-type) {
		color: #7fb4d9;
	}
	:global(.code-pane .shj-syn-str),
	:global(.code-pane .shj-syn-esc) {
		color: #d9a66c;
	}
	:global(.code-pane .shj-syn-cmnt) {
		color: #6f6b5f;
	}
	:global(.code-pane .shj-syn-num),
	:global(.code-pane .shj-syn-bool) {
		color: #9fca7c;
	}
	:global(.code-pane .shj-syn-func) {
		color: #d8c27a;
	}
	:global(.code-pane .shj-syn-oper),
	:global(.code-pane .shj-syn-var) {
		color: #a9a69d;
	}
	:global(.code-pane .shj-syn-deleted),
	:global(.code-pane .shj-syn-err) {
		color: #d96c5a;
	}
	:global(.code-pane .shj-syn-insert) {
		color: #7cb97c;
	}
</style>
