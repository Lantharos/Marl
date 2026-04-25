<script lang="ts">
	import { page } from '$app/stores';
	import { getProjectTree, getProjectFile, type ProjectTree, type ProjectFile } from '$lib/api';
	import FileTreePane from '$lib/FileTreePane.svelte';
	import CodePane from '$lib/CodePane.svelte';

	const tenant = $derived($page.params.tenant as string);
	const project = $derived($page.params.project as string);

	let tree = $state<ProjectTree | null>(null);
	let file = $state<ProjectFile | null>(null);
	let loading = $state(true);
	let error = $state('');

	async function load() {
		loading = true;
		error = '';
		try {
			tree = await getProjectTree(tenant, project, 'main');
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load';
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (tenant && project) load();
	});

	async function openFile(path: string) {
		const entry = tree?.entries.find((e) => e.path === path);
		if (entry?.entry_type !== 'blob') return;
		file = await getProjectFile(tenant, project, path, 'main');
	}
</script>

{#if loading}
	<div class="text-sm text-[#6f6b5f]">Loading files...</div>
{:else if error}
	<div class="text-sm text-[#d96c5a]">{error}</div>
{:else}
	<div class="flex gap-0 rounded border border-[#2a2a28] bg-[#141412]" style="height: calc(100vh - 140px);">
		<div class="w-[280px] shrink-0 border-r border-[#2a2a28] p-3">
			<FileTreePane entries={tree?.entries ?? []} selectedPath={file?.path ?? ''} onSelect={openFile} />
		</div>
		<div class="min-w-0 flex-1 overflow-auto p-4">
			<CodePane {file} />
		</div>
	</div>
{/if}
