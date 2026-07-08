<script module lang="ts">
	import type { ProjectComponent, Release, TagInfo } from '$lib/api';

	export type ReleaseCreateInput = {
		tag: string;
		name: string;
		notes: string;
		prerelease: boolean;
		draft: boolean;
		components: string[];
		files: File[];
	};
</script>

<script lang="ts">
	import ContentComposer from './ContentComposer.svelte';
	import Box from 'lucide-svelte/icons/box';
	import Check from 'lucide-svelte/icons/check';
	import ChevronDown from 'lucide-svelte/icons/chevron-down';
	import FileUp from 'lucide-svelte/icons/file-up';
	import Search from 'lucide-svelte/icons/search';
	import Sparkles from 'lucide-svelte/icons/sparkles';
	import Tag from 'lucide-svelte/icons/tag';
	import X from 'lucide-svelte/icons/x';

	let {
		tags,
		releases,
		busy = false,
		mode = 'create',
		initialRelease = null,
		projectComponents = [],
		onCreate,
		onCancel,
		onGenerateNotes
	}: {
		tags: TagInfo[];
		releases: Release[];
		busy?: boolean;
		mode?: 'create' | 'edit';
		initialRelease?: Release | null;
		projectComponents?: ProjectComponent[];
		onCreate: (input: ReleaseCreateInput) => Promise<void> | void;
		onCancel: () => void;
		onGenerateNotes: () => Promise<string> | string;
	} = $props();

	let tag = $state('');
	let tagQuery = $state('');
	let name = $state('');
	let notes = $state('');
	let prerelease = $state(false);
	let selectedComponents = $state<string[]>([]);
	let pendingFiles = $state<File[]>([]);
	let dragging = $state(false);
	let tagOpen = $state(false);
	let generatingNotes = $state(false);
	let fileInput = $state<HTMLInputElement | null>(null);
	let tagPicker = $state<HTMLElement | null>(null);
	let hydratedReleaseKey = $state('');

	const visibleComponents = $derived(projectComponents.filter((component) => component.visible !== false));
	const initialTag = $derived(initialRelease?.tag?.trim().toLowerCase() ?? '');
	const matchingTags = $derived.by(() => {
		const needle = tagQuery.trim().toLowerCase();
		return tags
			.filter((item) => {
				const value = tagValue(item);
				return value && (!needle || value.toLowerCase().includes(needle));
			})
			.slice(0, 9);
	});
	const selectedTag = $derived(tags.find((item) => tagValue(item).toLowerCase() === tag.trim().toLowerCase()));
	const tagExists = $derived(Boolean(selectedTag));
	const tagAlreadyReleased = $derived(Boolean(tag.trim() && releases.some((release) => releaseConflicts(release)) && tag.trim().toLowerCase() !== initialTag));
	const canSubmit = $derived(Boolean(tag.trim()) && !tagAlreadyReleased && !busy);
	const tagLocked = $derived(mode === 'edit');
	const showDraftButton = $derived(mode === 'create' || Boolean(initialRelease?.draft));
	const primaryLabel = $derived(mode === 'edit' && !initialRelease?.draft ? 'Save release' : 'Publish release');

	$effect(() => {
		if (!initialRelease) return;
		const key = `${initialRelease.id ?? ''}:${initialRelease.tag ?? ''}:${initialRelease.updated_at ?? ''}`;
		if (hydratedReleaseKey === key) return;
		tag = initialRelease.tag ?? '';
		tagQuery = initialRelease.tag ?? '';
		name = initialRelease.name ?? '';
		notes = initialRelease.notes ?? '';
		prerelease = Boolean(initialRelease.prerelease);
		selectedComponents = [...(initialRelease.components ?? [])];
		pendingFiles = [];
		hydratedReleaseKey = key;
	});

	function tagValue(item: TagInfo) {
		return item.tag ?? item.name ?? item.id ?? '';
	}

	function releaseConflicts(release: Release) {
		if (release.tag?.trim().toLowerCase() !== tag.trim().toLowerCase()) return false;
		if ((release.id ?? '') === (initialRelease?.id ?? '')) return false;
		return releaseScopeKey(release.components ?? []) === releaseScopeKey(selectedComponents);
	}

	function releaseScopeKey(components: string[]) {
		return components.length ? [...components].sort().join('+') : 'project';
	}

	function formatSize(value: number | string | null | undefined) {
		const size = typeof value === 'number' ? value : Number(value);
		if (!Number.isFinite(size) || size <= 0) return '';
		if (size < 1024) return `${size} B`;
		const units = ['KB', 'MB', 'GB'];
		let current = size / 1024;
		for (const unit of units) {
			if (current < 1024 || unit === 'GB') return `${current.toFixed(current >= 10 ? 0 : 1)} ${unit}`;
			current /= 1024;
		}
		return '';
	}

	function pickTag(value: string) {
		tag = value;
		tagQuery = value;
		tagOpen = false;
		if (!name.trim()) name = value;
	}

	function addFiles(files: FileList | File[] | null) {
		if (!files) return;
		const next = [...pendingFiles];
		for (const file of Array.from(files)) {
			const key = `${file.name}:${file.size}:${file.lastModified}`;
			if (!next.some((item) => `${item.name}:${item.size}:${item.lastModified}` === key)) {
				next.push(file);
			}
		}
		pendingFiles = next;
	}

	function removePendingFile(index: number) {
		pendingFiles = pendingFiles.filter((_, itemIndex) => itemIndex !== index);
	}

	async function submit(draft: boolean) {
		if (!canSubmit) return;
		await onCreate({
			tag: tag.trim(),
			name: name.trim() || tag.trim(),
			notes: notes.trim(),
			prerelease,
			draft,
			components: selectedComponents,
			files: pendingFiles
		});
		tag = '';
		tagQuery = '';
		name = '';
		notes = '';
		prerelease = false;
		selectedComponents = [];
		pendingFiles = [];
	}

	function toggleComponent(id: string) {
		selectedComponents = selectedComponents.includes(id) ? selectedComponents.filter((item) => item !== id) : [...selectedComponents, id];
	}

	async function generateNotes() {
		generatingNotes = true;
		try {
			const generated = (await onGenerateNotes()).trim();
			if (!generated) return;
			notes = notes.trim() ? `${notes.trim()}\n\n${generated}` : generated;
		} finally {
			generatingNotes = false;
		}
	}

	function handleDocumentClick(event: MouseEvent) {
		if (!tagOpen || !tagPicker) return;
		if (event.target instanceof Node && tagPicker.contains(event.target)) return;
		tagOpen = false;
	}
</script>

<svelte:document onclick={handleDocumentClick} />

<section class="border border-[#2a2a28] bg-[#141412]">
	<div class="grid gap-4 p-4">
		<div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
			<div class="grid gap-1.5" bind:this={tagPicker}>
				<label class="text-xs font-medium text-[#eae9e4]" for="release-tag-query">Tag</label>
				<div class="relative">
					<button
						class="release-field flex h-10 w-full items-center justify-between gap-2 border border-[#2a2a28] bg-[#0f0f0d] px-3 text-left text-sm text-[#eae9e4] focus-visible:border-[#d9a66c] disabled:text-[#8c887e]"
						type="button"
						disabled={tagLocked}
						onclick={() => (tagOpen = !tagOpen)}
					>
						<span class="inline-flex min-w-0 items-center gap-2">
							<Tag class="h-4 w-4 shrink-0 text-[#8c887e]" />
							<span class="truncate">{tag || 'Select or create tag'}</span>
						</span>
						<ChevronDown class="h-4 w-4 shrink-0 text-[#8c887e]" />
					</button>
					{#if tagOpen && !tagLocked}
						<div class="absolute left-0 top-11 z-30 w-full border border-[#2a2a28] bg-[#0f0f0d] shadow-xl">
							<div class="border-b border-[#252522] p-2">
								<div class="flex h-9 items-center gap-2 border border-[#2a2a28] bg-[#090908] px-2 focus-within:border-[#d9a66c]">
									<Search class="h-4 w-4 shrink-0 text-[#6f6b5f]" />
									<input
										id="release-tag-query"
										class="release-field min-w-0 flex-1 bg-transparent text-sm text-[#eae9e4] placeholder:text-[#6f6b5f]"
										placeholder="Search or create a tag"
										bind:value={tagQuery}
										oninput={() => (tag = tagQuery)}
									/>
								</div>
							</div>
							<div class="max-h-60 overflow-y-auto py-1">
								{#each matchingTags as item (tagValue(item))}
									{@const value = tagValue(item)}
									<button class="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-[#1e1e1c]" type="button" onclick={() => pickTag(value)}>
										<span class="min-w-0">
											<span class="block truncate font-mono text-sm text-[#eae9e4]">{value}</span>
											{#if item.snapshot}
												<span class="block truncate font-mono text-[11px] text-[#6f6b5f]">{item.snapshot}</span>
											{/if}
										</span>
										{#if tag === value}<Check class="h-4 w-4 shrink-0 text-[#d9a66c]" />{/if}
									</button>
								{/each}
								{#if tagQuery.trim() && !matchingTags.some((item) => tagValue(item).toLowerCase() === tagQuery.trim().toLowerCase())}
									<button class="w-full border-t border-[#252522] px-3 py-2 text-left text-sm text-[#eae9e4] hover:bg-[#1e1e1c]" type="button" onclick={() => pickTag(tagQuery.trim())}>
										Create new tag <span class="font-mono text-[#d9a66c]">{tagQuery.trim()}</span>
									</button>
								{/if}
							</div>
						</div>
					{/if}
				</div>
				{#if tagAlreadyReleased}
					<p class="text-xs text-[#d96c5a]">That tag already has a release.</p>
				{/if}
			</div>

			<div class="grid gap-1.5">
				<label class="text-xs font-medium text-[#eae9e4]" for="release-title">Release title</label>
				<input
					id="release-title"
					class="release-field h-10 border border-[#2a2a28] bg-[#0f0f0d] px-3 text-sm text-[#eae9e4] placeholder:text-[#6f6b5f] focus:border-[#d9a66c]"
					placeholder="Title"
					bind:value={name}
				/>
			</div>
		</div>

		<div class="flex flex-wrap items-center gap-2">
			{#if visibleComponents.length > 0}
				<div class="flex flex-wrap gap-1">
					{#each visibleComponents as component (component.id)}
						<button
							class="h-8 border px-3 text-xs {selectedComponents.includes(component.id) ? 'border-[#d9a66c] text-[#d9a66c]' : 'border-[#2a2a28] text-[#a09d94] hover:bg-[#1e1e1c] hover:text-[#eae9e4]'}"
							type="button"
							aria-pressed={selectedComponents.includes(component.id)}
							onclick={() => toggleComponent(component.id)}
						>
							{component.name}
						</button>
					{/each}
				</div>
			{/if}
			<button
				class="inline-flex h-8 items-center gap-2 border border-[#2a2a28] px-3 text-xs text-[#a09d94] hover:bg-[#1e1e1c] hover:text-[#eae9e4] disabled:opacity-50"
				type="button"
				disabled={generatingNotes}
				onclick={generateNotes}
			>
				<Sparkles class="h-3.5 w-3.5" />
				{generatingNotes ? 'Generating...' : 'Generate notes from recent saves'}
			</button>
			<button
				class="h-8 border border-[#2a2a28] px-3 text-xs {prerelease ? 'border-[#d9a66c] text-[#d9a66c]' : 'text-[#a09d94] hover:bg-[#1e1e1c] hover:text-[#eae9e4]'}"
				type="button"
				aria-pressed={prerelease}
				onclick={() => (prerelease = !prerelease)}
			>
				{prerelease ? 'Prerelease' : 'Mark as prerelease'}
			</button>
		</div>

		<ContentComposer value={notes} placeholder="Describe this release" minHeight="230px" onInput={(value) => (notes = value)} />

		<input
			bind:this={fileInput}
			class="sr-only"
			type="file"
			multiple
			onchange={(event) => {
				addFiles(event.currentTarget.files);
				event.currentTarget.value = '';
			}}
		/>
		<div
			class="grid gap-3 border border-dashed p-4 transition-colors {dragging ? 'border-[#d9a66c] bg-[#171410]' : 'border-[#2a2a28] bg-[#0f0f0d]'}"
			role="button"
			tabindex="0"
			ondragover={(event) => {
				event.preventDefault();
				dragging = true;
			}}
			ondragleave={() => (dragging = false)}
			ondrop={(event) => {
				event.preventDefault();
				dragging = false;
				addFiles(event.dataTransfer?.files ?? null);
			}}
			onclick={() => fileInput?.click()}
			onkeydown={(event) => {
				if (event.key === 'Enter' || event.key === ' ') {
					event.preventDefault();
					fileInput?.click();
				}
			}}
		>
			<div class="flex items-center justify-center gap-3 text-[#8c887e]">
				<FileUp class="h-5 w-5" />
				<span class="text-sm">Drop artifacts here or select files</span>
			</div>
			{#if pendingFiles.length}
				<div class="grid gap-1">
					{#each pendingFiles as file, index (`${file.name}:${file.size}:${file.lastModified}`)}
						<div class="flex min-h-9 items-center gap-2 bg-[#141412] px-2.5">
							<Box class="h-3.5 w-3.5 shrink-0 text-[#8c887e]" />
							<div class="min-w-0 flex-1 truncate text-xs text-[#eae9e4]">{file.name}</div>
							<div class="shrink-0 font-mono text-[11px] text-[#6f6b5f]">{formatSize(file.size)}</div>
							<button
								class="grid h-7 w-7 shrink-0 place-items-center text-[#6f6b5f] hover:text-[#d96c5a]"
								type="button"
								aria-label="Remove artifact"
								onclick={(event) => {
									event.stopPropagation();
									removePendingFile(index);
								}}
							>
								<X class="h-3.5 w-3.5" />
							</button>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<div class="flex flex-wrap justify-end gap-2 border-t border-[#252522] pt-4">
			<button class="h-9 px-3 text-sm text-[#8c887e] hover:text-[#eae9e4]" type="button" onclick={onCancel}>Cancel</button>
			{#if showDraftButton}
				<button class="h-9 border border-[#2a2a28] bg-[#242420] px-3 text-sm text-[#eae9e4] hover:bg-[#2f2f2b] disabled:opacity-50" type="button" disabled={!canSubmit} onclick={() => submit(true)}>
					Save draft
				</button>
			{/if}
			<button class="h-9 bg-[#eae9e4] px-3 text-sm font-medium text-[#0f0f0d] hover:bg-[#d9d5c6] disabled:opacity-50" type="button" disabled={!canSubmit} onclick={() => submit(false)}>
				{busy ? 'Saving...' : primaryLabel}
			</button>
		</div>
	</div>
</section>

<style>
	.release-field:focus,
	.release-field:focus-visible {
		outline: none !important;
		box-shadow: none !important;
	}
</style>
