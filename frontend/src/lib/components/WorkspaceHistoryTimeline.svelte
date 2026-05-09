<script lang="ts">
	import type { ChangedFile, HistoryEntry } from '$lib/api';
	import { userDisplayName, userInitials, withoutOpaqueUserIds } from '$lib/identity';
	import InfiniteLoader from './InfiniteLoader.svelte';

	let {
		entries,
		historyFiles,
		hasMore,
		onOpenEntry,
		onLoadMore
	}: {
		entries: HistoryEntry[];
		historyFiles: Record<string, ChangedFile[]>;
		hasMore: boolean;
		onOpenEntry: (entry: HistoryEntry) => void;
		onLoadMore: () => void;
	} = $props();

	function historyMessage(entry: HistoryEntry) {
		return withoutOpaqueUserIds(entry.message) || entry.kind;
	}

	function changeLabel(file: ChangedFile) {
		return file.change_type === 'added' ? 'A' : file.change_type === 'deleted' ? 'D' : 'M';
	}

	function changeClass(file: ChangedFile) {
		if (file.change_type === 'added') return 'text-[#7cb97c]';
		if (file.change_type === 'deleted') return 'text-[#d96c5a]';
		return 'text-[#d9a66c]';
	}
</script>

<div class="mx-auto max-w-3xl">
	<div class="relative grid gap-0">
		{#each entries as entry, index}
			{@const loaded = Object.prototype.hasOwnProperty.call(historyFiles, entry.id)}
			{@const files = historyFiles[entry.id] ?? []}
			<button class="relative flex w-full items-start gap-3 py-3 text-left hover:opacity-80" onclick={() => onOpenEntry(entry)}>
				{#if index < entries.length - 1}
					<div class="absolute bottom-[-12px] left-[15px] top-[30px] w-px bg-[#2a2a28]"></div>
				{/if}
				<div class="relative z-10 flex h-[30px] w-[30px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#2a2a28] text-[9px] font-medium text-[#eae9e4]">
					{#if entry.author_profile?.avatar_url}<img src={entry.author_profile.avatar_url} alt="" class="h-full w-full object-cover" />{:else}{userInitials(entry.author, entry.author_profile)}{/if}
				</div>
				<div class="min-w-0 flex-1 pb-3 {index < entries.length - 1 ? 'border-b border-[#252522]' : ''}">
					<div class="text-sm text-[#eae9e4]">{historyMessage(entry)}</div>
					<div class="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[#6f6b5f]">
						<span>{userDisplayName(entry.author, entry.author_profile)}</span>
						<span>{new Date(entry.timestamp).toLocaleString()}</span>
						{#if entry.snapshot_id}<span class="font-mono">{entry.snapshot_id.slice(0, 12)}</span>{/if}
					</div>
					{#if !loaded}
						<div class="mt-2 text-xs text-[#6f6b5f]">Loading changed files...</div>
					{:else if files.length}
						<div class="mt-2 text-xs text-[#8c887e]">{files.length} changed {files.length === 1 ? 'file' : 'files'}</div>
						<div class="mt-1 grid gap-1">
							{#each files.slice(0, 8) as file}
								<div class="flex min-w-0 items-center gap-2 text-xs">
									<span class="w-3 {changeClass(file)}">{changeLabel(file)}</span>
									<span class="truncate text-[#d8d5ca]">{file.path}</span>
								</div>
							{/each}
							{#if files.length > 8}
								<div class="text-xs text-[#6f6b5f]">+{files.length - 8} more</div>
							{/if}
						</div>
					{/if}
				</div>
			</button>
		{:else}
			<p class="py-4 text-center text-xs text-[#6f6b5f]">No history yet.</p>
		{/each}
	</div>
	<InfiniteLoader active={hasMore} onVisible={onLoadMore} />
</div>
