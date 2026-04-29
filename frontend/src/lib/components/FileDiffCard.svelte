<script lang="ts">
	import type { HistoryEntry } from '$lib/api';
	import { highlightCode } from '$lib/codeHighlight';
	import { renderFileDiffHunks, type DiffHunk, type DiffRow } from '$lib/diff';
	import { userDisplayName } from '$lib/identity';

	let {
		path,
		oldText,
		newText,
		entry = null
	}: {
		path: string;
		oldText: string | null;
		newText: string | null;
		entry?: HistoryEntry | null;
	} = $props();

	const hunks = $derived(renderFileDiffHunks(oldText, newText));
	let expandedBefore = $state<Record<string, boolean>>({});
	let expandedAfter = $state<Record<string, boolean>>({});

	function rowClass(kind: DiffRow['kind']) {
		switch (kind) {
			case 'add':
				return 'bg-[#122016] text-[#bfe8c2]';
			case 'remove':
				return 'bg-[#241513] text-[#e6b8ae]';
			default:
				return 'text-[#d8d5ca]';
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
		return expandedBefore[hunk.id] ? hunk.before : hunk.before.slice(-1);
	}

	function visibleAfter(hunk: DiffHunk) {
		return expandedAfter[hunk.id] ? hunk.after : hunk.after.slice(0, 1);
	}
</script>

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
			{#if hunk.hiddenBefore > 0 || hunk.before.length > 1}
				<button
					type="button"
					class="grid w-full grid-cols-[52px_20px_1fr] border-b border-[#1d1d1a] bg-[#10100e] text-left text-[#6f6b5f] hover:bg-[#171714]"
					onclick={() => (expandedBefore[hunk.id] = !expandedBefore[hunk.id])}
				>
					<span class="px-2 text-right">{hunk.hiddenBefore > 0 ? hunk.hiddenBefore : hunk.before.length - 1}</span>
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
			{#if hunk.hiddenAfter > 0 || hunk.after.length > 1}
				<button
					type="button"
					class="grid w-full grid-cols-[52px_20px_1fr] border-b border-[#1d1d1a] bg-[#10100e] text-left text-[#6f6b5f] hover:bg-[#171714]"
					onclick={() => (expandedAfter[hunk.id] = !expandedAfter[hunk.id])}
				>
					<span class="px-2 text-right">{hunk.hiddenAfter > 0 ? hunk.hiddenAfter : hunk.after.length - 1}</span>
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
	<div class="grid grid-cols-[52px_20px_1fr] border-b border-[#1d1d1a] {rowClass(row.kind)}">
		<div class="select-none border-r border-[#2a2a28] px-2 text-right text-[#6f6b5f]">{row.newLine ?? row.oldLine ?? ''}</div>
		<div class="select-none text-center text-[#8a8578]">{marker(row.kind)}</div>
		<pre class="min-w-0 overflow-x-auto px-2 whitespace-pre-wrap break-words">{@html highlightCode(row.text || ' ')}</pre>
	</div>
{/snippet}
