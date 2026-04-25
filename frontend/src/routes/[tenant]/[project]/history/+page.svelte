<script lang="ts">
	import { page } from '$app/stores';
	import { getProjectHistory, getHistoryEntryDetail, type HistoryEntry, type HistoryEntryDetail } from '$lib/api';
	import StackedDiff from '$lib/components/StackedDiff.svelte';

	const tenant = $derived($page.params.tenant as string);
	const project = $derived($page.params.project as string);

	let entries = $state<HistoryEntry[]>([]);
	let expanded = $state<string | null>(null);
	let detail = $state<HistoryEntryDetail | null>(null);
	let loading = $state(true);
	let detailLoading = $state(false);
	let error = $state('');

	async function load() {
		loading = true;
		error = '';
		try {
			entries = await getProjectHistory(tenant, project);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (tenant && project) load();
	});

	async function toggleEntry(entry: HistoryEntry) {
		if (expanded === entry.id) {
			expanded = null;
			detail = null;
			return;
		}
		expanded = entry.id;
		detailLoading = true;
		try {
			detail = await getHistoryEntryDetail(tenant, project, entry.id);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			detailLoading = false;
		}
	}

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

	const workspaces = $derived(['__all__', ...new Set(entries.map((e) => e.workspace))]);
	let filter = $state('__all__');
	const filtered = $derived(filter === '__all__' ? entries : entries.filter((e) => e.workspace === filter));
</script>

<div>
	<h3 class="mb-4 text-sm font-semibold text-[#f0eee4]">History</h3>

	{#if loading}
		<div class="text-sm text-[#6f6b5f]">Loading...</div>
	{:else if error}
		<div class="text-sm text-[#d96c5a]">{error}</div>
	{:else}
		<div class="mb-4 flex flex-wrap gap-2">
			{#each workspaces as ws}
				<button
					class="rounded px-2.5 py-1 text-xs font-medium {filter === ws ? 'bg-[#eae9e4] text-[#0f0f0d]' : 'bg-[#2a2a28] text-[#a09d94] hover:bg-[#3a3a36]'}"
					onclick={() => (filter = ws)}
				>
					{ws === '__all__' ? 'All' : ws}
				</button>
			{/each}
		</div>

		<div class="grid gap-2">
			{#each filtered as entry}
				<div class="rounded border border-[#2a2a28] bg-[#141412]">
					<button
						class="flex w-full items-start gap-3 px-4 py-3 text-left"
						onclick={() => toggleEntry(entry)}
					>
						<div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold {color(entry.kind)}">
							{icon(entry.kind)}
						</div>
						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-center gap-2">
								<span class="text-sm font-medium text-[#eae9e4]">{entry.message || entry.kind}</span>
								<span class="rounded bg-[#1e1e1c] px-1.5 py-0.5 text-[10px] text-[#6f6b5f]">{entry.workspace}</span>
							</div>
							<div class="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[#6f6b5f]">
								<span>{entry.author}</span>
								<span>{new Date(entry.timestamp).toLocaleString()}</span>
								{#if entry.agent}
									<span class="rounded bg-[#1e1e1c] px-1.5 py-0.5 text-[#a09d94]">agent: {entry.agent}</span>
								{/if}
								{#if entry.model}
									<span class="rounded bg-[#1e1e1c] px-1.5 py-0.5 text-[#a09d94]">model: {entry.model}</span>
								{/if}
							</div>
						</div>
						<span class="shrink-0 text-xs text-[#6f6b5f]">{expanded === entry.id ? '▲' : '▼'}</span>
					</button>

					{#if expanded === entry.id}
						<div class="border-t border-[#2a2a28] px-4 py-4">
							{#if detailLoading}
								<div class="text-sm text-[#6f6b5f]">Loading diff...</div>
							{:else if detail}
								{#if detail.files_changed.length > 0}
									<div class="mb-3 flex items-center gap-3 text-xs text-[#6f6b5f]">
										<span>{detail.files_changed.length} files changed</span>
										<span class="text-[#7cb97c]">+{detail.files_changed.reduce((s, f) => s + f.additions, 0)}</span>
										<span class="text-[#d96c5a]">-{detail.files_changed.reduce((s, f) => s + f.deletions, 0)}</span>
									</div>

									{#if detail.tool}
										<div class="mb-3 text-xs text-[#a09d94]">Tool: {detail.tool}</div>
									{/if}

									<StackedDiff files={detail.files_changed} />
								{:else}
									<p class="text-sm text-[#6f6b5f]">No file changes recorded for this entry.</p>
								{/if}
							{/if}
						</div>
					{/if}
				</div>
			{:else}
				<p class="py-8 text-center text-sm text-[#6f6b5f]">No history yet.</p>
			{/each}
		</div>
	{/if}
</div>
