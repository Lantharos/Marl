<script lang="ts">
	import type { ProjectFile } from '$lib/api';
	import { highlightCode } from '$lib/codeHighlight';

	let { file }: { file: ProjectFile | null } = $props();

	const lines = $derived(file?.text?.split('\n') ?? []);
</script>

{#if !file}
	<div class="grid min-h-[360px] place-items-center px-6 text-center text-sm text-[#6f6b5f]">
		Select a file from the tree.
	</div>
{:else if file.binary || file.text === null}
	<div class="grid min-h-[360px] place-items-center px-6 text-center text-sm text-[#6f6b5f]">
		This file is stored as binary content.
	</div>
{:else}
	<div class="overflow-auto bg-[#0f0f0d] font-mono text-[12px] leading-5 text-[#eae9e4]">
		{#each lines as line, index}
			<div class="grid grid-cols-[44px_1fr] border-b border-[#171714] hover:bg-[#171714]">
				<div class="select-none border-r border-[#242420] px-2 text-right text-[#5f5b52]">{index + 1}</div>
				<pre class="min-w-0 overflow-x-auto px-3 py-0 whitespace-pre-wrap break-words">{@html highlightCode(line || ' ')}</pre>
			</div>
		{/each}
	</div>
{/if}
