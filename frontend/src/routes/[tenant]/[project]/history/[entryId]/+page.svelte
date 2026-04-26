<script lang="ts">
	import { page } from '$app/stores';
	import { getHistoryEntryDetail, getProjectFile, type HistoryEntry } from '$lib/api';
	import FileTreePane from '$lib/FileTreePane.svelte';
	import FileDiffCard from '$lib/components/FileDiffCard.svelte';

	const tenant = $derived($page.params.tenant as string);
	const project = $derived($page.params.project as string);
	const entryId = $derived($page.params.entryId as string);

	let detail = $state<(HistoryEntry & { parent_id: string | null; files: { path: string; change_type: string; old_id: string | null; new_id: string | null }[] }) | null>(null);
	let loading = $state(true);
	let error = $state('');
	let selectedPath = $state('');
	let selectedOldText = $state<string | null>(null);
	let selectedNewText = $state<string | null>(null);
	let fileLoading = $state(false);

	async function load() {
		loading = true;
		error = '';
		try {
			detail = await getHistoryEntryDetail(tenant, project, entryId);
			if (detail.files.length > 0) {
				selectedPath = detail.files[0].path;
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			loading = false;
		}
	}

	async function loadSelectedFile(path: string) {
		if (!detail) return;
		fileLoading = true;
		selectedOldText = null;
		selectedNewText = null;
		const file = detail.files.find((f) => f.path === path);
		if (!file) {
			fileLoading = false;
			return;
		}
		try {
			if (file.change_type !== 'added' && detail.parent_id) {
				try {
					const f = await getProjectFile(tenant, project, path, detail.workspace, detail.parent_id);
					selectedOldText = f.text;
				} catch {
					selectedOldText = null;
				}
			}
			if (file.change_type !== 'deleted' && detail.snapshot_id) {
				try {
					const f = await getProjectFile(tenant, project, path, detail.workspace, detail.snapshot_id);
					selectedNewText = f.text;
				} catch {
					selectedNewText = null;
				}
			}
		} finally {
			fileLoading = false;
		}
	}

	$effect(() => {
		if (tenant && project && entryId) load();
	});

	$effect(() => {
		if (selectedPath && detail) {
			loadSelectedFile(selectedPath);
		}
	});

	const treeEntries = $derived(detail?.files.map((f) => ({ path: f.path, name: f.path.split('/').pop() ?? f.path, id: f.new_id ?? f.old_id ?? '', entry_type: 'blob' as const })) ?? []);

	const gitStatus = $derived(detail?.files.map((f) => ({ path: f.path, status: f.change_type as 'added' | 'deleted' | 'modified' | 'renamed' | 'untracked' })) ?? []);

	function icon(kind: HistoryEntry['kind']) {
		switch (kind) {
			case 'save': return 'S';
			case 'ship': return 'SHIP';
			case 'cram': return 'C';
			case 'merge': return 'M';
			case 'ready': return 'R';
			default: return '?';
		}
	}

	function color(kind: HistoryEntry['kind']) {
		switch (kind) {
			case 'save': return 'bg-[#2a2a28] text-[#a09d94]';
			case 'ship': return 'bg-[#3a3a36] text-[#7cb97c]';
			case 'cram': return 'bg-[#3a3a36] text-[#d9a66c]';
			case 'merge': return 'bg-[#3a3a36] text-[#d96c5a]';
			case 'ready': return 'bg-[#3a3a36] text-[#6ba4c7]';
			default: return 'bg-[#2a2a28] text-[#a09d94]';
		}
	}
</script>

<div class="flex flex-col gap-4 overflow-hidden" style="height: calc(100vh - 180px);">
	{#if loading}
		<div class="text-sm text-[#6f6b5f]">Loading...</div>
	{:else if error}
		<div class="text-sm text-[#d96c5a]">{error}</div>
	{:else if detail}
		<div class="flex items-start gap-3 rounded border border-[#2a2a28] bg-[#141412] px-4 py-3">
			<div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold {color(detail.kind)}">
				{icon(detail.kind)}
			</div>
			<div class="min-w-0 flex-1">
				<div class="flex flex-wrap items-center gap-2">
					<span class="text-sm font-medium text-[#eae9e4]">{detail.message || detail.kind}</span>
					<span class="rounded bg-[#1e1e1c] px-1.5 py-0.5 text-[10px] text-[#6f6b5f]">{detail.workspace}</span>
				</div>
				<div class="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[#6f6b5f]">
					<span>{detail.author}</span>
					<span>{new Date(detail.timestamp).toLocaleString()}</span>
					{#if detail.snapshot_id}
						<span class="font-mono text-[10px]">{detail.snapshot_id.slice(0, 12)}</span>
					{/if}
				</div>
			</div>
		</div>

		{#if detail.files.length === 0}
			<div class="rounded border border-[#2a2a28] bg-[#141412] p-8 text-center">
				<p class="text-sm text-[#8c887e]">No file changes for this entry.</p>
			</div>
		{:else}
			<div class="flex flex-1 gap-4 overflow-hidden min-h-0">
				<div class="w-64 shrink-0 flex flex-col rounded border border-[#2a2a28] bg-[#141412]">
					<div class="shrink-0 border-b border-[#2a2a28] px-3 py-2 text-xs font-medium text-[#6f6b5f]">
						{detail.files.length} changed {detail.files.length === 1 ? 'file' : 'files'}
					</div>
					<div class="flex-1 overflow-auto min-h-0 p-2">
						<FileTreePane entries={treeEntries} {selectedPath} {gitStatus} initialExpansion="open" flattenEmptyDirectories={true} onSelect={(p) => { selectedPath = p; }} />
					</div>
				</div>
				<div class="flex-1 overflow-y-auto rounded border border-[#2a2a28]">
					{#if fileLoading}
						<div class="text-sm text-[#6f6b5f]">Loading diff...</div>
					{:else if selectedPath}
						<FileDiffCard
							path={selectedPath}
							oldText={selectedOldText}
							newText={selectedNewText}
						/>
					{/if}
				</div>
			</div>
		{/if}
	{/if}
</div>
