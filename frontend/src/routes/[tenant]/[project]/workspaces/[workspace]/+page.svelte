<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import {
		getWorkspaceDetail,
		getProjectFile,
		mergeWorkspace,
		markWorkspaceReady,
		type ProjectFile
	} from '$lib/api';
	import FileTreePane from '$lib/FileTreePane.svelte';
	import CodePane from '$lib/CodePane.svelte';

	const tenant = $derived($page.params.tenant as string);
	const project = $derived($page.params.project as string);
	const workspaceName = $derived($page.params.workspace as string);

	let detail = $state<Awaited<ReturnType<typeof getWorkspaceDetail>> | null>(null);
	let file = $state<ProjectFile | null>(null);
	let loading = $state(true);
	let error = $state('');
	let busy = $state(false);

	async function load() {
		loading = true;
		error = '';
		try {
			detail = await getWorkspaceDetail(tenant, project, workspaceName);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (tenant && project && workspaceName) load();
	});

	async function openFile(path: string) {
		const entry = detail?.files.entries.find((e) => e.path === path);
		if (entry?.entry_type !== 'blob') return;
		file = await getProjectFile(tenant, project, path, workspaceName);
	}

	async function handleReady() {
		busy = true;
		try {
			await markWorkspaceReady(tenant, project, workspaceName);
			await load();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			busy = false;
		}
	}

	async function handleMerge() {
		busy = true;
		try {
			await mergeWorkspace(tenant, project, workspaceName);
			await load();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			busy = false;
		}
	}

	function historyIcon(kind: 'save' | 'ship' | 'cram' | 'merge' | 'ready') {
		switch (kind) {
			case 'save': return 'S';
			case 'ship': return 'SHIP';
			case 'cram': return 'C';
			case 'merge': return 'M';
			case 'ready': return 'R';
			default: return '?';
		}
	}

	function historyColor(kind: 'save' | 'ship' | 'cram' | 'merge' | 'ready') {
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

{#if loading}
	<div class="text-sm text-[#6f6b5f]">Loading workspace...</div>
{:else if error}
	<div class="text-sm text-[#d96c5a]">{error}</div>
{:else if detail}
	<div class="mx-auto max-w-5xl">
		<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
			<div>
				<h2 class="text-xl font-semibold text-[#f0eee4]">{detail.name}</h2>
				<div class="mt-1 flex items-center gap-2 text-xs text-[#6f6b5f]">
					<span class="font-mono">{detail.head?.slice(0, 12) ?? 'empty'}</span>
					{#if detail.parent_workspace}
						<span>from {detail.parent_workspace}</span>
					{/if}
				</div>
			</div>
			<div class="flex gap-2">
				{#if !detail.is_ready}
					<button
						class="rounded bg-[#6ba4c7] px-3 py-1.5 text-xs font-medium text-[#0f0f0d] hover:bg-[#5a93b6]"
						disabled={busy}
						onclick={handleReady}
					>
						Mark ready
					</button>
				{:else}
					<button
						class="rounded bg-[#eae9e4] px-3 py-1.5 text-xs font-medium text-[#0f0f0d] hover:bg-[#d9d5c6]"
						disabled={busy}
						onclick={handleMerge}
					>
						Merge
					</button>
				{/if}
			</div>
		</div>

		<div class="grid gap-5 xl:grid-cols-[1fr_300px]">
			<div class="rounded border border-[#2a2a28] bg-[#141412] p-4">
				<h4 class="mb-2 text-xs font-semibold uppercase tracking-wide text-[#6f6b5f]">Files</h4>
				<div class="flex gap-0 overflow-hidden" style="height: calc(100vh - 220px);">
					<div class="w-[260px] shrink-0 flex flex-col border-r border-[#2a2a28]">
						<div class="flex-1 overflow-auto min-h-0 pr-3">
							<FileTreePane entries={detail.files.entries} selectedPath={file?.path ?? ''} onSelect={openFile} />
						</div>
					</div>
					<div class="min-w-0 flex-1 overflow-auto pl-4">
						<CodePane {file} />
					</div>
				</div>
			</div>

			<div class="grid gap-5">
				{#if detail.child_workspaces.length}
					<div class="rounded border border-[#2a2a28] bg-[#141412] p-4">
						<h4 class="mb-3 text-xs font-semibold uppercase tracking-wide text-[#6f6b5f]">Child workspaces</h4>
						<div class="grid gap-1">
							{#each detail.child_workspaces as child}
								<button
									class="rounded bg-[#0f0f0d] px-2.5 py-1.5 text-left text-sm text-[#eae9e4] hover:bg-[#1a1a18]"
									onclick={() => goto(`/${tenant}/${project}/workspaces/${child}`)}
								>
									{child}
								</button>
							{/each}
						</div>
					</div>
				{/if}

				<div class="rounded border border-[#2a2a28] bg-[#141412] p-4">
					<h4 class="mb-3 text-xs font-semibold uppercase tracking-wide text-[#6f6b5f]">History</h4>
					<div class="relative grid gap-0">
						<div class="absolute left-[15px] top-0 bottom-0 w-px bg-[#2a2a28]"></div>
						{#each detail.history as entry}
							<button
								class="relative flex w-full items-start gap-2 py-1.5 text-left hover:opacity-80"
								onclick={() => goto(`/${tenant}/${project}/history/${entry.id}`)}
							>
								<div class="relative z-10 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[8px] font-bold {historyColor(entry.kind)}">
									{historyIcon(entry.kind)}
								</div>
								<div class="min-w-0 flex-1">
									<div class="text-xs text-[#eae9e4]">{entry.message || entry.kind}</div>
									<div class="text-[10px] text-[#6f6b5f]">{entry.author} · {new Date(entry.timestamp).toLocaleString()}</div>
								</div>
							</button>
						{:else}
							<p class="py-4 text-center text-xs text-[#6f6b5f]">No history yet.</p>
						{/each}
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}
