<script lang="ts">
	import { renderFileDiff, type DiffRow } from '$lib/diff';

	let {
		path,
		oldText,
		newText
	}: {
		path: string;
		oldText: string | null;
		newText: string | null;
	} = $props();

	const rows = $derived(renderFileDiff(oldText, newText));

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
</script>

<div class="h-full overflow-auto bg-[#141412] font-mono text-[12px] leading-5">
	<div class="sticky top-0 z-10 border-b border-[#2a2a28] bg-[#141412] px-3 py-2 text-xs text-[#a09d94]">
		{path}
	</div>
	{#if rows.length}
		{#each rows as row}
			<div class="grid grid-cols-[42px_42px_20px_1fr] border-b border-[#1d1d1a] {rowClass(row.kind)}">
				<div class="select-none border-r border-[#2a2a28] px-2 text-right text-[#6f6b5f]">{row.oldLine ?? ''}</div>
				<div class="select-none border-r border-[#2a2a28] px-2 text-right text-[#6f6b5f]">{row.newLine ?? ''}</div>
				<div class="select-none text-center text-[#8a8578]">{marker(row.kind)}</div>
				<pre class="min-w-0 overflow-x-auto px-2 whitespace-pre-wrap break-words">{row.text || ' '}</pre>
			</div>
		{/each}
	{:else}
		<div class="grid min-h-[180px] place-items-center text-sm text-[#6f6b5f]">No changes.</div>
	{/if}
</div>
