<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { TreeEntryInfo } from '$lib/api';

	let {
		entries,
		selectedPath,
		onSelect,
		gitStatus,
		initialExpansion = 0,
		flattenEmptyDirectories = false
	}: {
		entries: TreeEntryInfo[];
		selectedPath: string;
		onSelect: (path: string) => void;
		gitStatus?: { path: string; status: 'added' | 'deleted' | 'modified' | 'renamed' | 'untracked' }[];
		initialExpansion?: 'closed' | 'open' | number;
		flattenEmptyDirectories?: boolean;
	} = $props();

	let host: HTMLDivElement;
	let tree: InstanceType<typeof import('@pierre/trees').FileTree> | null = null;
	let lastPaths: string[] = [];
	let renderRun = 0;

	$effect(() => {
		const paths = entries.map((entry) => entry.entry_type === 'tree' ? entry.path + '/' : entry.path).sort();
		const pathsChanged = paths.join('\n') !== lastPaths.join('\n');
		lastPaths = paths;

		if (!host) return;

		if (!tree || pathsChanged) {
			const run = ++renderRun;
			tree?.cleanUp();
			tree = null;
			(async () => {
				const { FileTree } = await import('@pierre/trees');
				if (run !== renderRun || !host) return;
				const nextTree = new FileTree({
					paths,
					initialExpansion,
					initialSelectedPaths: selectedPath ? [selectedPath] : [],
					flattenEmptyDirectories,
					search: paths.length > 8,
					stickyFolders: true,
					gitStatus,
					onSelectionChange(paths) {
						const path = paths[0];
						if (path && !path.endsWith('/')) {
							onSelect(path);
						}
					},
					unsafeCSS: `
						:host {
							font: 13px/1.45 IBM Plex Sans, Aptos, Segoe UI, sans-serif;
							--trees-bg-override: transparent;
							--trees-fg-override: #eae9e4;
							--trees-fg-muted-override: #8c887e;
							--trees-bg-muted-override: #1e1e1c;
							--trees-selected-bg-override: rgba(217, 166, 108, 0.12);
							--trees-selected-fg-override: #d9a66c;
							--trees-focus-ring-color-override: transparent;
							--trees-focus-ring-width-override: 0px;
							--trees-border-color-override: #2a2a28;
							--trees-search-bg-override: #0f0f0d;
							--trees-search-fg-override: #eae9e4;
							--trees-input-bg-override: #0f0f0d;
							--trees-scrollbar-thumb-override: #3a3a36;
							--trees-indent-guide-bg-override: #2a2a28;
						}
						[data-type='item'] {
							cursor: pointer;
						}
						[data-item-focused='true']::before {
							outline: none !important;
						}
						[data-file-tree-search-input] {
							border-color: #2a2a28 !important;
						}
						[data-file-tree-search-input]:focus-visible,
						[data-file-tree-search-input][data-file-tree-search-input-fake-focus='true'] {
							outline-color: #d9a66c !important;
						}
					`
				});
				nextTree.render({ containerWrapper: host });
				tree = nextTree;
			})();
		} else if (selectedPath) {
			const item = tree.getItem(selectedPath);
			if (item) {
				item.select();
				item.focus();
			}
		}
	});

	onDestroy(() => {
		renderRun += 1;
		tree?.cleanUp();
		tree = null;
	});
</script>

<div bind:this={host} class="h-full"></div>
