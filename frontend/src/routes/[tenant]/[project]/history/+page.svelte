<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { getProjectHistory, isAbortError, type HistoryEntry } from '$lib/api';
	import Spinner from '$lib/components/Spinner.svelte';
	import { userName, withoutOpaqueUserIds } from '$lib/identity';

	const tenant = $derived($page.params.tenant as string);
	const project = $derived($page.params.project as string);

	let entries = $state<HistoryEntry[]>([]);
	let loading = $state(true);
	let error = $state('');

	async function load(signal: AbortSignal) {
		loading = true;
		error = '';
		try {
			entries = await getProjectHistory(tenant, project, { signal });
		} catch (e) {
			if (isAbortError(e)) return;
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			if (!signal.aborted) loading = false;
		}
	}

	$effect(() => {
		if (!tenant || !project) return;
		const controller = new AbortController();
		load(controller.signal);
		return () => controller.abort();
	});

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

	function displayMessage(entry: HistoryEntry) {
		return withoutOpaqueUserIds(entry.message) || entry.kind;
	}
</script>

<div>
	<h3 class="mb-4 text-sm font-semibold text-[#f0eee4]">History</h3>

	{#if loading}
		<Spinner />
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
				<button
					class="flex w-full items-start gap-3 rounded border border-[#2a2a28] bg-[#141412] px-4 py-3 text-left hover:bg-[#1a1a18]"
					onclick={() => goto(`/${tenant}/${project}/history/${entry.id}`)}
				>
					<div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold {color(entry.kind)}">
						{icon(entry.kind)}
					</div>
					<div class="min-w-0 flex-1">
						<div class="flex flex-wrap items-center gap-2">
							<span class="text-sm font-medium text-[#eae9e4]">{displayMessage(entry)}</span>
							<span class="rounded bg-[#1e1e1c] px-1.5 py-0.5 text-[10px] text-[#6f6b5f]">{entry.workspace}</span>
						</div>
						<div class="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[#6f6b5f]">
							<span>{userName(entry.author, entry.author_profile)}</span>
							<span>{new Date(entry.timestamp).toLocaleString()}</span>
							{#if entry.snapshot_id}
								<span class="font-mono text-[10px]">{entry.snapshot_id.slice(0, 8)}</span>
							{/if}
						</div>
					</div>
					<span class="shrink-0 text-xs text-[#6f6b5f]">→</span>
				</button>
			{:else}
				<p class="py-8 text-center text-sm text-[#6f6b5f]">No history yet.</p>
			{/each}
		</div>
	{/if}
</div>
