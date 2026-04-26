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
	let view: FileDiff | null = null;

	$effect(() => {
		const _host = host;
		const _path = path;
		const _old = oldText;
		const _new = newText;
		if (!_host) return;

		view?.cleanUp();
		_host.replaceChildren();

		const diff = renderFileDiff(_path, _old, _new, `${_path}-${Date.now()}`);
		if (!diff) return;

		const v = new FileDiff({
			theme: 'pierre-dark',
			diffStyle: 'unified',
			diffIndicators: 'bars',
			overflow: 'wrap',
			unsafeCSS: `
				:host {
					--diffs-bg: #141412;
					--diffs-bg-context: #141412;
				}
			`
		});
		v.render({
			fileDiff: diff,
			oldFile: { name: _path, contents: _old ?? '' },
			newFile: { name: _path, contents: _new ?? '' },
			containerWrapper: _host
		});
		view = v;
	});

	onDestroy(() => {
		view?.cleanUp();
	});
</script>

<div bind:this={host} class="overflow-hidden"></div>
