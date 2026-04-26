<script lang="ts">
	import { onDestroy } from 'svelte';

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
	let view: { cleanUp(): void } | null = null;
	let virtualizer: { cleanUp(): void } | null = null;
	let renderRun = 0;

	$effect(() => {
		const _scroll = scrollHost;
		const _content = contentHost;
		const _path = path;
		const _old = oldText;
		const _new = newText;
		if (!_scroll || !_content) return;

		const run = ++renderRun;
		view?.cleanUp();
		virtualizer?.cleanUp();
		view = null;
		virtualizer = null;
		_content.replaceChildren();

		(async () => {
			const [{ FileDiff, VirtualizedFileDiff, Virtualizer }, { renderFileDiff }] = await Promise.all([
				import('@pierre/diffs'),
				import('$lib/diff')
			]);
			if (run !== renderRun || !scrollHost || !contentHost) return;

			const diff = renderFileDiff(_path, _old, _new);
			if (!diff) return;

			const lineCount = (_old ?? '').split('\n').length + (_new ?? '').split('\n').length;
			const useVirtual = lineCount > 300;

			if (useVirtual) {
				const nextVirtualizer = new Virtualizer({ overscrollSize: 1000 });
				nextVirtualizer.setup(_scroll, _content);

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
					nextVirtualizer
				);
				v.render({
					fileDiff: diff,
					containerWrapper: _content,
					oldFile: { name: _path, contents: _old ?? '' },
					newFile: { name: _path, contents: _new ?? '' }
				});
				virtualizer = nextVirtualizer;
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
		})();
		return () => {
			if (run === renderRun) renderRun += 1;
			view?.cleanUp();
			virtualizer?.cleanUp();
			view = null;
			virtualizer = null;
		};
	});

	onDestroy(() => {
		renderRun += 1;
		view?.cleanUp();
		virtualizer?.cleanUp();
		view = null;
		virtualizer = null;
	});
</script>

<div bind:this={scrollHost} class="h-full overflow-auto">
	<div bind:this={contentHost}></div>
</div>
