<script lang="ts">
	import { page } from '$app/stores';
	import { getProjectTree, getProjectFile, isAbortError, type ProjectTree, type ProjectFile } from '$lib/api';
	import CodePane from '$lib/CodePane.svelte';
	import FilePathTree from '$lib/components/FilePathTree.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import { downloadProjectSource } from '$lib/projectDataApi';
	import Download from 'lucide-svelte/icons/download';

	const tenant = $derived($page.params.tenant as string);
	const project = $derived($page.params.project as string);
	const snapshot = $derived($page.url.searchParams.get('snapshot') ?? undefined);

	let tree = $state<ProjectTree | null>(null);
	let file = $state<ProjectFile | null>(null);
	let loadingTree = $state(true);
	let loadingFile = $state(false);
	let error = $state('');
	let downloadBusy = $state(false);
	let fileController: AbortController | null = null;
	let downloadController: AbortController | null = null;

	async function loadTree(signal: AbortSignal, snapshotId = snapshot) {
		loadingTree = true;
		error = '';
		try {
			tree = await getProjectTree(tenant, project, 'main', snapshotId, { signal, limit: 4000 });
		} catch (e) {
			if (isAbortError(e)) return;
			error = e instanceof Error ? e.message : 'Failed to load';
			tree = null;
		} finally {
			if (!signal.aborted) loadingTree = false;
		}
	}

	async function loadDefaultFile(signal: AbortSignal, snapshotId = snapshot) {
		if (!tree) return;
		const path = defaultFilePath(tree.entries);
		if (!path) {
			file = null;
			return;
		}
		loadingFile = true;
		fileController?.abort();
		const controller = new AbortController();
		fileController = controller;
		try {
			file = await getProjectFile(tenant, project, path, 'main', snapshotId, { signal: controller.signal });
		} catch (e) {
			if (isAbortError(e)) return;
			error = e instanceof Error ? e.message : 'Failed to load file';
			file = null;
		} finally {
			if (!signal.aborted && fileController === controller) {
				loadingFile = false;
				fileController = null;
			}
		}
	}

	async function load(signal: AbortSignal, snapshotId = snapshot) {
		await loadTree(signal, snapshotId);
		if (!signal.aborted && tree) {
			await loadDefaultFile(signal, snapshotId);
		}
	}

	$effect(() => {
		if (!tenant || !project) return;
		const currentSnapshot = snapshot;
		const controller = new AbortController();
		load(controller.signal, currentSnapshot);
		return () => {
			controller.abort();
			fileController?.abort();
			downloadController?.abort();
		};
	});

	function defaultFilePath(entries: ProjectTree['entries']) {
		const files = entries.filter((entry) => entry.entry_type === 'blob');
		const rootReadme = files.find((entry) => entry.path.toLowerCase() === 'readme.md');
		const anyReadme = files.find((entry) => entry.name.toLowerCase().startsWith('readme.'));
		return (rootReadme ?? anyReadme ?? files[0])?.path ?? '';
	}

	const treeEntries = $derived(
		(tree?.entries ?? []).map((entry) => ({ path: entry.path, kind: entry.entry_type === 'tree' ? 'dir' as const : 'file' as const }))
	);

	async function openFile(path: string) {
		const entry = tree?.entries.find((e) => e.path === path);
		if (entry?.entry_type !== 'blob') return;
		fileController?.abort();
		const controller = new AbortController();
		fileController = controller;
		loadingFile = true;
		try {
			file = await getProjectFile(tenant, project, path, 'main', snapshot, { signal: controller.signal });
		} catch (e) {
			if (!isAbortError(e)) error = e instanceof Error ? e.message : 'Failed to load file';
		} finally {
			if (fileController === controller) {
				loadingFile = false;
				fileController = null;
			}
		}
	}

	async function downloadSource() {
		if (downloadBusy) return;
		downloadController?.abort();
		const controller = new AbortController();
		downloadController = controller;
		downloadBusy = true;
		error = '';
		try {
			const response = await downloadProjectSource(tenant, project, 'main', snapshot, { signal: controller.signal });
			const blob = await response.blob();
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = `${safeName(`${tenant}-${project}`)}${snapshot ? `-${snapshot.slice(0, 12)}` : ''}.zip`;
			document.body.append(link);
			link.click();
			link.remove();
			setTimeout(() => URL.revokeObjectURL(url), 0);
		} catch (e) {
			if (!isAbortError(e)) error = e instanceof Error ? e.message : 'Failed to download source';
		} finally {
			if (downloadController === controller) downloadController = null;
			downloadBusy = false;
		}
	}

	function safeName(value: string) {
		return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'source';
	}
</script>

{#if loadingTree}
	<Spinner />
{:else if error}
	<div class="text-sm text-[#d96c5a]">{error}</div>
{:else}
	<div class="mx-[calc(50%-50vw)] px-6">
		{#if snapshot}
			<div class="mb-3 font-mono text-xs text-[#8c887e]">Source snapshot {snapshot.slice(0, 12)}</div>
		{/if}
		<div class="grid gap-4 md:grid-cols-[320px_minmax(0,1fr)]" style="height: calc(100vh - 166px);">
			<div class="min-h-0 overflow-hidden rounded border border-[#2a2a28] bg-[#141412]">
				<div class="flex items-center justify-between gap-3 border-b border-[#242420] px-3 py-2 text-xs font-medium text-[#8c887e]">
					<span>{treeEntries.length} {treeEntries.length === 1 ? 'item' : 'items'}</span>
					<button
						type="button"
						class="inline-flex shrink-0 items-center gap-1 text-xs {downloadBusy ? 'text-[#d9a66c]' : 'text-[#6f6b5f] hover:text-[#a09d94]'}"
						disabled={downloadBusy}
						onclick={downloadSource}
					>
						<Download class="h-3.5 w-3.5" />
						<span>{downloadBusy ? 'downloading' : 'download'}</span>
					</button>
				</div>
				<FilePathTree
					entries={treeEntries}
					selectedPath={file?.path ?? ''}
					onSelect={openFile}
					maxHeight="calc(100% - 33px)"
					minHeight="0px"
					fill={true}
					initialExpansion="collapsed"
					autoExpandPaths={false}
				/>
			</div>
			<div class="min-h-0 min-w-0 overflow-hidden rounded border border-[#2a2a28] bg-[#0f0f0d]">
				{#if loadingFile && !file}
					<div class="flex h-full items-center justify-center">
						<Spinner />
					</div>
				{:else}
					<CodePane {file} />
				{/if}
			</div>
		</div>
	</div>
{/if}
