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
</script>

<FilePathTree {entries} {selectedPath} {commentCountsByFile} {maxHeight} {minHeight} {fill} {onSelect} />
