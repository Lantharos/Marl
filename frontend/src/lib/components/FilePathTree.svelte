<script lang="ts">
	import ChevronDown from 'lucide-svelte/icons/chevron-down';
	import ChevronRight from 'lucide-svelte/icons/chevron-right';
	import Icon from '@iconify/svelte';

	type FilePathTreeEntry = {
		path: string;
		kind?: 'file' | 'dir';
		status?: string;
	};

	type TreeNode = {
		kind: 'dir' | 'file';
		name: string;
		path: string;
		children: Map<string, TreeNode>;
		entry?: FilePathTreeEntry;
	};

	type TreeRow = {
		node: TreeNode;
		depth: number;
	};

	let {
		entries,
		selectedPath = '',
		commentCountsByFile = {},
		maxHeight = '45vh',
		minHeight = '220px',
		fill = false,
		initialExpansion = 'open',
		autoExpandPaths = false,
		expandedPaths = [],
		onSelect
	}: {
		entries: FilePathTreeEntry[];
		selectedPath?: string;
		commentCountsByFile?: Record<string, number>;
		maxHeight?: string;
		minHeight?: string;
		fill?: boolean;
		initialExpansion?: 'open' | 'collapsed';
		autoExpandPaths?: boolean;
		expandedPaths?: string[];
		onSelect: (path: string) => void;
	} = $props();

	let collapsedDirs = $state<Set<string>>(new Set());
	let loadedEntriesKey = $state('');
	let loadedTreeConfig = $state('');
	const expandedPathSet = $derived(new Set(expandedPaths));
	const expandedPathSignature = $derived(expandedPaths.join('|'));

	const rows = $derived(flattenTree(buildTree(entries), collapsedDirs));
	const entriesKey = $derived(entries.map((entry) => `${entry.kind ?? 'file'}:${entry.path}`).join('|'));

	$effect(() => {
		const validDirectories = new Set(directoryPaths(buildTree(entries)));
		const treeConfig = `${entriesKey}|${expandedPathSignature}`;
		if (loadedEntriesKey !== entriesKey || loadedTreeConfig !== treeConfig) {
			loadedEntriesKey = entriesKey;
			loadedTreeConfig = treeConfig;
			if (initialExpansion === 'collapsed') {
				const collapsed = autoExpandPaths
					? directoryPaths(buildTree(entries)).filter((path) => !expandedPathSet.has(path))
					: directoryPaths(buildTree(entries));
				collapsedDirs = new Set(collapsed);
				return;
			}
			collapsedDirs = new Set();
			return;
		}
		const next = new Set([...collapsedDirs].filter((path) => validDirectories.has(path)));
		if (next.size !== collapsedDirs.size) collapsedDirs = next;
	});

	function buildTree(items: FilePathTreeEntry[]) {
		const root: TreeNode = { kind: 'dir', name: '', path: '', children: new Map() };
		for (const entry of items) {
			const parts = entry.path.split('/').filter(Boolean);
			let current = root;
			for (let index = 0; index < parts.length; index += 1) {
				const name = parts[index];
				const path = parts.slice(0, index + 1).join('/');
				const kind = index === parts.length - 1 ? (entry.kind ?? 'file') : 'dir';
				let child = current.children.get(name);
				if (!child) {
					child = { kind, name, path, children: new Map() };
					current.children.set(name, child);
				}
				if (index === parts.length - 1) {
					child.kind = kind;
					child.entry = entry;
				}
				current = child;
			}
		}
		return root;
	}

	function flattenTree(root: TreeNode, collapsed: Set<string>) {
		const output: TreeRow[] = [];
		appendRows([...root.children.values()], 0, collapsed, output);
		return output;
	}

	function directoryPaths(root: TreeNode) {
		const paths: string[] = [];
		collectDirectoryPaths([...root.children.values()], paths);
		return paths;
	}

	function collectDirectoryPaths(nodes: TreeNode[], paths: string[]) {
		for (const node of nodes) {
			if (node.kind !== 'dir') continue;
			paths.push(node.path);
			collectDirectoryPaths([...node.children.values()], paths);
		}
	}

	function appendRows(nodes: TreeNode[], depth: number, collapsed: Set<string>, output: TreeRow[]) {
		for (const node of sortNodes(nodes)) {
			output.push({ node, depth });
			if (node.kind === 'dir' && !collapsed.has(node.path)) appendRows([...node.children.values()], depth + 1, collapsed, output);
		}
	}

	function sortNodes(nodes: TreeNode[]) {
		return [...nodes].sort((a, b) => {
			if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
			return a.name.localeCompare(b.name);
		});
	}

	function toggleDirectory(path: string) {
		const next = new Set(collapsedDirs);
		if (next.has(path)) next.delete(path);
		else next.add(path);
		collapsedDirs = next;
	}

	function statusLabel(status?: string) {
		if (status === 'added') return 'A';
		if (status === 'deleted') return 'D';
		if (status === 'renamed') return 'R';
		if (status === 'modified') return 'M';
		return '';
	}

	function statusClass(status?: string) {
		if (status === 'added') return 'text-[#7cb97c]';
		if (status === 'deleted') return 'text-[#d96c5a]';
		if (status === 'renamed') return 'text-[#9bb5d9]';
		if (status === 'modified') return 'text-[#d9a66c]';
		return 'text-[#6f6b5f]';
	}

	function iconForNode(node: TreeNode, collapsed: boolean) {
		if (node.kind === 'dir') return collapsed ? 'vscode-icons:default-folder' : 'vscode-icons:default-folder-opened';
		const extension = node.name.toLowerCase().split('.').pop() ?? '';
		const name = node.name.toLowerCase();
		if (name === 'dockerfile') return 'vscode-icons:file-type-docker';
		if (name === 'makefile') return 'vscode-icons:file-type-makefile';
		const icons: Record<string, string> = {
			css: 'vscode-icons:file-type-css',
			html: 'vscode-icons:file-type-html',
			js: 'vscode-icons:file-type-js',
			json: 'vscode-icons:file-type-json',
			md: 'vscode-icons:file-type-markdown',
			ps1: 'vscode-icons:file-type-powershell',
			rs: 'vscode-icons:file-type-rust',
			svelte: 'vscode-icons:file-type-svelte',
			toml: 'vscode-icons:file-type-toml',
			ts: 'vscode-icons:file-type-typescript',
			yaml: 'vscode-icons:file-type-yaml',
			yml: 'vscode-icons:file-type-yaml'
		};
		return icons[extension] ?? 'vscode-icons:default-file';
	}
</script>

<div class="overflow-auto {fill ? 'h-full' : ''}" style={`max-height:${maxHeight};min-height:${minHeight};`}>
	<div class="w-max min-w-full {fill ? 'pb-16' : ''}">
		{#each rows as row (row.node.path)}
			{@const node = row.node}
			{@const isDirectory = node.kind === 'dir'}
			{@const isCollapsed = collapsedDirs.has(node.path)}
			{@const comments = commentCountsByFile[node.path] ?? 0}
			{@const status = statusLabel(node.entry?.status)}
			<button
				class="flex min-w-full items-center gap-1.5 whitespace-nowrap px-1.5 py-1 text-left text-xs hover:bg-[#1a1a18] {selectedPath === node.path ? 'bg-[#1f1f1c] text-[#eae9e4]' : 'text-[#a09d94]'}"
				style={`padding-left:${6 + row.depth * 14}px`}
				onclick={() => isDirectory ? toggleDirectory(node.path) : onSelect(node.path)}
			>
				{#if isDirectory}
					{#if isCollapsed}<ChevronRight class="h-3.5 w-3.5 shrink-0 text-[#6f6b5f]" />{:else}<ChevronDown class="h-3.5 w-3.5 shrink-0 text-[#6f6b5f]" />{/if}
					<Icon icon={iconForNode(node, isCollapsed)} class="h-4 w-4 shrink-0" />
				{:else}
					<span class="w-3.5 shrink-0"></span>
					<Icon icon={iconForNode(node, false)} class="h-4 w-4 shrink-0" />
				{/if}
				<span class="shrink-0">{node.name}</span>
				{#if !isDirectory}
					{#if status}
						<span class="ml-2 w-3 shrink-0 font-mono {statusClass(node.entry?.status)}">{status}</span>
					{/if}
					{#if comments}
						<span class="shrink-0 bg-[#242420] px-1 text-[10px] text-[#d9a66c]">{comments}</span>
					{/if}
				{/if}
			</button>
		{:else}
			<div class="px-2 py-3 text-xs text-[#6f6b5f]">No files to show.</div>
		{/each}
	</div>
</div>
