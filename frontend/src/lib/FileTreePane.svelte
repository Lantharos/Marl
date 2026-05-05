<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { TreeEntryInfo } from '$lib/api';

	let {
		entries,
		selectedPath,
		onSelect,
		gitStatus,
		commentCounts,
		initialExpansion = 0,
		flattenEmptyDirectories = false
	}: {
		entries: TreeEntryInfo[];
		selectedPath: string;
		onSelect: (path: string) => void;
		gitStatus?: { path: string; status: 'added' | 'deleted' | 'modified' | 'renamed' | 'untracked' }[];
		commentCounts?: Record<string, number>;
		initialExpansion?: 'closed' | 'open' | number;
		flattenEmptyDirectories?: boolean;
	} = $props();

	const commentSpriteSheet = `
		<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true">
			<symbol id="sty-review-comment" viewBox="0 0 16 16">
				<path d="M4.5 3.5h7A2.5 2.5 0 0 1 14 6v3.5a2.5 2.5 0 0 1-2.5 2.5H8l-3.5 2v-2A2.5 2.5 0 0 1 2 9.5V6a2.5 2.5 0 0 1 2.5-2.5Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
			</symbol>
		</svg>
	`;

	let host: HTMLDivElement;
	let tree: InstanceType<typeof import('@pierre/trees').FileTree> | null = null;
	let lastPaths: string[] = [];
	let lastCommentSignature = '';
	let renderRun = 0;

	function settleTreeLayout(targetTree: typeof tree) {
		const container = targetTree?.getFileTreeContainer();
		if (!container) return;
		container.style.width = '100%';
		container.style.height = '100%';
		container.style.minHeight = '0';
		container.style.alignSelf = 'stretch';
		container.style.margin = '0';
		const scroll = container.shadowRoot?.querySelector<HTMLElement>("[data-file-tree-virtualized-scroll='true']");
		if (scroll) scroll.scrollTop = 0;
	}

	$effect(() => {
		const paths = entries.map((entry) => entry.entry_type === 'tree' ? entry.path + '/' : entry.path).sort();
		const pathsChanged = paths.join('\n') !== lastPaths.join('\n');
		const commentSignature = JSON.stringify(commentCounts ?? {});
		const commentsChanged = commentSignature !== lastCommentSignature;
		lastPaths = paths;
		lastCommentSignature = commentSignature;

		if (!host) return;

		if (!tree || pathsChanged || commentsChanged) {
			const run = ++renderRun;
			tree?.cleanUp();
			tree = null;
			host.replaceChildren();
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
					icons: {
						set: 'complete',
						colored: true,
						spriteSheet: commentSpriteSheet
					},
					renderRowDecoration({ item }) {
						const count = commentCounts?.[item.path] ?? 0;
						if (item.kind !== 'file' || count === 0) return null;
						return {
							icon: { name: 'sty-review-comment', width: 13, height: 13 },
							title: `${count} ${count === 1 ? 'comment' : 'comments'}`
						};
					},
					onSelectionChange(paths) {
						const path = paths[0];
						if (path && !path.endsWith('/')) {
							onSelect(path);
						}
					},
					unsafeCSS: `
						:host {
							font: 13px/1.45 IBM Plex Sans, Aptos, Segoe UI, sans-serif;
							width: 100%;
							height: 100%;
							min-height: 0;
							margin: 0;
							align-self: stretch;
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
						[data-file-tree-virtualized-wrapper='true'],
						[data-file-tree-virtualized-root='true'] {
							min-height: 0;
							margin: 0;
						}
						[data-file-tree-virtualized-scroll='true'],
						[data-file-tree-scrollbar-measure='true'] {
							scrollbar-width: none;
						}
						[data-file-tree-virtualized-scroll='true']::-webkit-scrollbar,
						[data-file-tree-scrollbar-measure='true']::-webkit-scrollbar {
							width: 0;
							height: 0;
							display: none;
						}
						[data-file-tree-search-container] {
							margin-top: 0 !important;
						}
						[data-type='item'] {
							cursor: pointer;
							padding: 4px 6px;
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
						[data-item-section='decoration'] {
							color: #6ba4c7;
							width: 18px;
						}
					`
				});
				nextTree.render({ containerWrapper: host });
				settleTreeLayout(nextTree);
				tree = nextTree;
			})();
		} else if (selectedPath) {
			const item = tree.getItem(selectedPath);
			if (item) {
				item.select();
			}
			settleTreeLayout(tree);
		}
	});

	onDestroy(() => {
		renderRun += 1;
		tree?.cleanUp();
		tree = null;
	});
</script>

<div bind:this={host} class="flex h-full min-h-0 flex-col items-stretch overflow-hidden"></div>
