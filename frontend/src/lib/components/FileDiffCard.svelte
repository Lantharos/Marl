<script lang="ts">
	import { onDestroy } from 'svelte';
	import { FileDiff } from '@pierre/diffs';
	import { renderFileDiff } from '$lib/diff';

	let {
		path,
		oldText,
		newText
	}: {
		path: string;
		oldText: string | null;
		newText: string | null;
	} = $props();

	let host = $state<HTMLDivElement>();
	let view = $state<FileDiff | null>(null);

	$effect(() => {
		if (!host) return;
		view?.cleanUp();
		host.replaceChildren();
		const diff = renderFileDiff(path, oldText, newText, `${path}-${Date.now()}`);
		if (!diff) return;
		const v = new FileDiff({
			theme: 'pierre-dark',
			diffStyle: 'unified',
			diffIndicators: 'bars',
			overflow: 'wrap',
			unsafeCSS: 'pre { background: #0f0f0d !important; }'
		});
		v.render({
			fileDiff: diff,
			oldFile: { name: path, contents: oldText ?? '' },
			newFile: { name: path, contents: newText ?? '' },
			containerWrapper: host
		});
		view = v;
	});

	onDestroy(() => {
		view?.cleanUp();
	});
</script>

<div class="rounded border border-[#2a2a28] bg-[#0f0f0d]">
	<div class="flex items-center gap-3 border-b border-[#2a2a28] px-3 py-2">
		<span class="text-xs font-medium text-[#eae9e4]">{path}</span>
		{#if oldText === null && newText !== null}
			<span class="text-xs text-[#7cb97c]">added</span>
		{:else if oldText !== null && newText === null}
			<span class="text-xs text-[#d96c5a]">deleted</span>
		{:else}
			<span class="text-xs text-[#d9a66c]">modified</span>
		{/if}
	</div>
	<div bind:this={host} class="overflow-hidden"></div>
</div>
