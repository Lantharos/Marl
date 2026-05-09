<script lang="ts">
	import type { ChangedFile } from '$lib/api';
	import FilePathTree from './FilePathTree.svelte';

	let {
		changedFiles,
		selectedPath,
		commentCountsByFile,
		onSelect
	}: {
		changedFiles: ChangedFile[];
		selectedPath: string;
		commentCountsByFile: Record<string, number>;
		onSelect: (path: string) => void;
	} = $props();

	const entries = $derived(changedFiles.map((file) => ({ path: file.path, kind: 'file' as const, status: file.change_type })));
</script>

<FilePathTree {entries} {selectedPath} {commentCountsByFile} {onSelect} />
