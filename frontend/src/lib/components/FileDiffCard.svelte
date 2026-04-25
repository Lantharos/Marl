<script lang="ts">
	import { onDestroy } from 'svelte';
	import { FileDiff } from '@pierre/diffs';
	import type { ChangedFile } from '$lib/api';
	import { renderFileDiff } from '$lib/diff';

	let { file }: { file: ChangedFile } = $props();

	let host = $state<HTMLDivElement>();
	let view = $state<FileDiff | null>(null);

	$effect(() => {
		if (!host) return;
		view?.cleanUp();
		host.replaceChildren();
		const diff = renderFileDiff(file.path, file.old_text, file.new_text, `${file.path}-${Date.now()}`);
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
			oldFile: { name: file.path, contents: file.old_text ?? '' },
			newFile: { name: file.path, contents: file.new_text ?? '' },
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
		<span class="text-xs font-medium text-[#eae9e4]">{file.path}</span>
		<span class="text-xs text-[#7cb97c]">+{file.additions}</span>
		<span class="text-xs text-[#d96c5a]">-{file.deletions}</span>
	</div>
	<div bind:this={host} class="overflow-hidden"></div>
</div>
