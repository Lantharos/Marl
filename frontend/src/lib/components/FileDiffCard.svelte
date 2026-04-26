<script lang="ts">
	import { onDestroy } from 'svelte';
	import { FileDiff, VirtualizedFileDiff, Virtualizer } from '@pierre/diffs';
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

	let scrollHost = $state<HTMLDivElement>();
	let contentHost = $state<HTMLDivElement>();
	let view: FileDiff | VirtualizedFileDiff | null = null;
	let virtualizer: Virtualizer | null = null;

	$effect(() => {
		const _scroll = scrollHost;
		const _content = contentHost;
		const _path = path;
		const _old = oldText;
		const _new = newText;
		if (!_scroll || !_content) return;

		view?.cleanUp();
		virtualizer?.cleanUp();
		_content.replaceChildren();

		const diff = renderFileDiff(_path, _old, _new, `${_path}-${Date.now()}`);
		if (!diff) return;

		const lineCount = (_old ?? '').split('\n').length + (_new ?? '').split('\n').length;
		const useVirtual = lineCount > 300;

		if (useVirtual) {
			virtualizer = new Virtualizer({ overscrollSize: 1000 });
			virtualizer.setup(_scroll, _content);

			const v = new VirtualizedFileDiff(
				{
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
				},
				virtualizer
			);
			v.render({
				fileDiff: diff,
				containerWrapper: _content,
				oldFile: { name: _path, contents: _old ?? '' },
				newFile: { name: _path, contents: _new ?? '' }
			});
			view = v;
		} else {
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
				containerWrapper: _content,
				oldFile: { name: _path, contents: _old ?? '' },
				newFile: { name: _path, contents: _new ?? '' }
			});
			view = v;
		}
	});

	onDestroy(() => {
		view?.cleanUp();
		virtualizer?.cleanUp();
	});
</script>

<div bind:this={scrollHost} class="h-full overflow-auto">
	<div bind:this={contentHost}></div>
</div>
