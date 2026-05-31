<script lang="ts">
	import type { ChangedFile } from '$lib/api';
	import FilePathTree from './FilePathTree.svelte';

	let {
		changedFiles,
		selectedPath,
		commentCountsByFile,
		maxHeight = '45vh',
		minHeight = '220px',
		fill = false,
		onSelect
	}: {
		changedFiles: ChangedFile[];
		selectedPath: string;
		commentCountsByFile: Record<string, number>;
		maxHeight?: string;
		minHeight?: string;
		fill?: boolean;
		onSelect: (path: string) => void;
	} = $props();

	const entries = $derived(changedFiles.map((file) => ({ path: file.path, kind: 'file' as const, status: file.change_type })));
	const expandedPaths = $derived.by(() => {
		const directories = new Set<string>();
		const parts = selectedPath.split('/').filter(Boolean);
		let cursor = '';
		for (let index = 0; index < parts.length - 1; index += 1) {
			cursor = cursor ? `${cursor}/${parts[index]}` : parts[index];
			directories.add(cursor);
		}
		return [...directories];
	});

</script>

	<FilePathTree
	{entries}
	{selectedPath}
	{commentCountsByFile}
	{maxHeight}
	{minHeight}
	{fill}
	autoExpandPaths={true}
	{onSelect}
	initialExpansion="collapsed"
	{expandedPaths}
/>
