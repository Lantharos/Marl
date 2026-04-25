<script lang="ts">
	import { onDestroy } from 'svelte';
	import { File } from '@pierre/diffs';
	import type { ProjectFile } from '$lib/api';

	let { file }: { file: ProjectFile | null } = $props();

	let codeHost = $state<HTMLDivElement>();
	let codeView: File | null = null;
	let signature = '';

	$effect(() => {
		if (!file || !codeHost) {
			return;
		}
		const nextSignature = `${file.id}:${file.path}:${file.text ?? ''}`;
		if (nextSignature === signature) {
			return;
		}
		signature = nextSignature;
		codeView?.cleanUp();
		codeHost.replaceChildren();
		if (file.binary || file.text === null) {
			return;
		}
		const contents = { name: file.path, contents: file.text, cacheKey: file.id };
		codeView = new File({
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
		codeView.render({ file: contents, containerWrapper: codeHost });
	});

	onDestroy(() => {
		codeView?.cleanUp();
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
