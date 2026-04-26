<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { ProjectFile } from '$lib/api';

	let { file }: { file: ProjectFile | null } = $props();

	let codeHost = $state<HTMLDivElement>();
	let codeView: InstanceType<typeof import('@pierre/diffs').File> | null = null;
	let signature = '';
	let renderRun = 0;

	$effect(() => {
		const run = ++renderRun;
		if (!file || !codeHost) {
			codeView?.cleanUp();
			codeView = null;
			signature = '';
			return;
		}
		const nextSignature = `${file.id}:${file.path}:${file.binary}:${file.text === null}`;
		if (nextSignature === signature) {
			return;
		}
		signature = nextSignature;
		codeView?.cleanUp();
		codeView = null;
		codeHost.replaceChildren();
		if (file.binary || file.text === null) {
			return;
		}
		const contents = { name: file.path, contents: file.text, cacheKey: file.id };
		(async () => {
			const { File } = await import('@pierre/diffs');
			if (run !== renderRun || !codeHost) return;
			const view = new File({
				theme: 'pierre-dark',
				disableFileHeader: false,
				disableLineNumbers: false,
				overflow: 'wrap',
				unsafeCSS: `
					:host {
						--diffs-bg: transparent;
						--diffs-light-bg: transparent;
						--diffs-dark-bg: transparent;
						--diffs-bg-buffer: #1a1a18;
						--diffs-bg-hover: #1e1e1c;
						--diffs-bg-context: #0f0f0d;
						--diffs-fg: #eae9e4;
						--diffs-fg-number: #6f6b5f;
						--diffs-gap-style: none;
					}
					:host, pre, code, [data-gutter], [data-line], [data-column-number] {
						background: transparent !important;
						background-color: transparent !important;
					}
					[data-gutter] [data-gutter-buffer],
					[data-gutter] [data-column-number] {
						border-right: none !important;
					}
				`
			});
			view.render({ file: contents, containerWrapper: codeHost });
			codeView = view;
		})();
		return () => {
			if (run === renderRun) renderRun += 1;
			codeView?.cleanUp();
			codeView = null;
		};
	});

	onDestroy(() => {
		renderRun += 1;
		codeView?.cleanUp();
		codeView = null;
	});
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
	<div bind:this={codeHost} class="overflow-hidden"></div>
{/if}
