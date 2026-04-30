<script lang="ts">
	import { page } from '$app/stores';
	import { onDestroy } from 'svelte';
	import {
		createRelease,
		isAbortError,
		listReleasesPage,
		listTags,
		uploadReleaseArtifact,
		type Paginated,
		type Release,
		type ReleaseArtifact,
		type TagInfo
	} from '$lib/api';
	import { apiBase } from '$lib/session';
	import Markdown from '$lib/components/Markdown.svelte';
	import PaginationControls from '$lib/components/PaginationControls.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import { userName } from '$lib/identity';
	import { currentProjectAccess } from '$lib/projectAccessStore';
	import Box from 'lucide-svelte/icons/box';
	import Download from 'lucide-svelte/icons/download';
	import GitCommit from 'lucide-svelte/icons/git-commit';
	import Plus from 'lucide-svelte/icons/plus';
	import Tag from 'lucide-svelte/icons/tag';
	import Upload from 'lucide-svelte/icons/upload';
	import X from 'lucide-svelte/icons/x';

	const tenant = $derived($page.params.tenant as string);
	const project = $derived($page.params.project as string);

	let releaseData = $state<Paginated<Release> | null>(null);
	let tags = $state<TagInfo[]>([]);
	let releasePage = $state(1);
	let loading = $state(true);
	let error = $state('');
	let showForm = $state(false);
	let tag = $state('');
	let name = $state('');
	let notes = $state('');
	let pendingFiles = $state<File[]>([]);
	let dragging = $state(false);
	let busy = $state(false);
	let fileInput = $state<HTMLInputElement | null>(null);
	let canMutate = $state(false);

	const unsubscribe = currentProjectAccess.subscribe((value) => {
		canMutate = Boolean(value?.can_maintain);
	});

	onDestroy(unsubscribe);

	const releases = $derived(releaseData?.items ?? []);
	const tagSuggestions = $derived(() => {
		const needle = tag.trim().toLowerCase();
		return tags
			.filter((item) => {
				const value = item.tag ?? item.name ?? item.id ?? '';
				return !needle || value.toLowerCase().includes(needle);
			})
			.slice(0, 8);
	});
	const exactTag = $derived(tags.find((item) => (item.tag ?? item.name ?? item.id ?? '').toLowerCase() === tag.trim().toLowerCase()));
	const tagWillBeCreated = $derived(!!tag.trim() && !exactTag);

	$effect(() => {
		if (!canMutate) showForm = false;
	});

	function releaseTitle(release: Release) {
		return release.name?.trim() || release.tag;
	}

	function releaseDate(release: Release) {
		const value = release.created_at ?? release.updated_at;
		return value ? new Date(value).toLocaleDateString() : '';
	}

	function artifactList(release: Release) {
		const seen = new Set<string>();
		return [...(release.artifacts ?? []), ...(release.assets ?? [])].filter((artifact) => {
			if (!artifact.name?.trim()) return false;
			const key = artifact.id ?? artifact.url ?? `${artifact.name}:${artifact.digest ?? ''}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
	}

	function artifactMeta(artifact: ReleaseArtifact) {
		const parts = [formatSize(artifact.size), artifact.digest, artifact.content_type].filter(Boolean);
		return parts.join(' | ');
	}

	function artifactHref(artifact: ReleaseArtifact) {
		const href = artifact.download_url ?? artifact.url;
		if (!href) return null;
		return href.startsWith('/') ? `${apiBase()}${href}` : href;
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

	function openFilePicker() {
		fileInput?.click();
	}

	async function load(signal?: AbortSignal) {
		loading = true;
		error = '';
		try {
			const [releaseResult, tagResult] = await Promise.all([
				listReleasesPage(tenant, project, { page: releasePage, perPage: 25, signal }),
				listTags(tenant, project, { page: 1, perPage: 100, signal }).catch(() => null)
			]);
			releaseData = releaseResult;
			tags = tagResult?.items ?? [];
		} catch (e) {
			if (isAbortError(e)) return;
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			if (!signal?.aborted) loading = false;
		}
	}

	$effect(() => {
		if (!tenant || !project) return;
		const controller = new AbortController();
		load(controller.signal);
		return () => controller.abort();
	});

	async function handleCreate() {
		if (!tag.trim()) return;
		const tagName = tag.trim();
		busy = true;
		error = '';
		try {
			const release = await createRelease(tenant, project, {
				tag: tagName,
				name: name.trim() || tagName,
				notes: notes.trim() || null
			});
			const releaseId = release.id ?? tagName;
			for (const file of pendingFiles) {
				await uploadReleaseArtifact(tenant, project, releaseId, file);
			}
			tag = '';
			name = '';
			notes = '';
			pendingFiles = [];
			showForm = false;
			releasePage = 1;
			await load();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			busy = false;
		}
	}
</script>

<div class="mx-auto max-w-5xl">
	<div class="mb-5 flex items-center justify-between gap-4">
		<div>
			<h3 class="text-base font-semibold text-[#f0eee4]">Releases</h3>
			<p class="mt-1 text-sm text-[#8c887e]">Changelogs, pinned source snapshots, and uploaded artifacts.</p>
		</div>
		{#if canMutate}
			<button class="inline-flex items-center gap-1 rounded bg-[#eae9e4] px-3 py-1.5 text-xs font-medium text-[#0f0f0d] hover:bg-[#d9d5c6]" onclick={() => (showForm = !showForm)}>
				<Plus class="h-3.5 w-3.5" /> New release
			</button>
		{/if}
	</div>

	{#if canMutate && showForm}
		<div class="mb-5 grid gap-4 rounded border border-[#2a2a28] bg-[#141412] p-4">
			<div class="grid gap-3 md:grid-cols-2 md:items-start">
				<div class="grid gap-2">
					<input class="h-10 w-full rounded bg-[#0f0f0d] px-3 text-sm text-[#eae9e4] outline-none" placeholder="Tag" bind:value={tag} />
					{#if tagSuggestions().length}
						<div class="flex flex-wrap gap-1.5">
							{#each tagSuggestions() as item}
								{@const value = item.tag ?? item.name ?? item.id ?? ''}
								<button
									class="bg-[#0f0f0d] px-2 py-1 font-mono text-xs {tag === value ? 'text-[#d9a66c]' : 'text-[#a09d94] hover:text-[#eae9e4]'}"
									onclick={() => (tag = value)}
								>
									{value}
								</button>
							{/each}
						</div>
					{/if}
					{#if tagWillBeCreated}
						<p class="text-[11px] text-[#6f6b5f]">Creates tag <span class="font-mono text-[#a09d94]">{tag.trim()}</span>.</p>
					{/if}
				</div>
				<input class="h-10 w-full self-start rounded bg-[#0f0f0d] px-3 text-sm text-[#eae9e4] outline-none" placeholder="Name" bind:value={name} />
			</div>
			<textarea class="min-h-[140px] resize-y rounded bg-[#0f0f0d] px-3 py-2 text-sm text-[#eae9e4] outline-none" placeholder="Release notes" bind:value={notes}></textarea>

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
				class="grid gap-3 rounded border border-dashed p-4 transition-colors {dragging ? 'border-[#d9a66c] bg-[#171410]' : 'border-[#2a2a28] bg-[#0f0f0d]'}"
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
				onclick={openFilePicker}
				onkeydown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						openFilePicker();
					}
				}}
			>
				<div class="flex items-center gap-3">
					<div class="flex h-8 w-8 items-center justify-center rounded bg-[#1e1e1c] text-[#d9a66c]">
						<Upload class="h-4 w-4" />
					</div>
					<div class="min-w-0">
						<div class="text-sm font-medium text-[#eae9e4]">Drop artifacts here</div>
						<div class="mt-0.5 text-xs text-[#6f6b5f]">Files are uploaded to sty and attached to the release.</div>
					</div>
				</div>
				{#if pendingFiles.length}
					<div class="grid gap-1">
						{#each pendingFiles as file, index}
							<div class="flex items-center gap-2 rounded bg-[#141412] px-2.5 py-2">
								<Box class="h-3.5 w-3.5 shrink-0 text-[#8c887e]" />
								<div class="min-w-0 flex-1 truncate text-xs text-[#eae9e4]">{file.name}</div>
								<div class="shrink-0 font-mono text-[11px] text-[#6f6b5f]">{formatSize(file.size)}</div>
								<button
									class="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[#6f6b5f] hover:bg-[#252522] hover:text-[#d96c5a]"
									onclick={(event) => {
										event.stopPropagation();
										removePendingFile(index);
									}}
									aria-label="Remove artifact"
								>
									<X class="h-3.5 w-3.5" />
								</button>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<div class="flex justify-end gap-2">
				<button class="px-3 py-1.5 text-xs text-[#a09d94] hover:text-[#eae9e4]" onclick={() => (showForm = false)}>Cancel</button>
				<button class="rounded bg-[#eae9e4] px-3 py-1.5 text-xs font-medium text-[#0f0f0d] disabled:opacity-50" disabled={busy || !tag.trim()} onclick={handleCreate}>
					{busy ? 'Creating...' : 'Create'}
				</button>
			</div>
		</div>
	{/if}

	{#if loading}
		<Spinner />
	{:else if error}
		<div class="text-sm text-[#d96c5a]">{error}</div>
	{:else}
		<div class="grid gap-5">
			{#each releases as release}
				{@const artifacts = artifactList(release)}
				<section class="grid gap-3 rounded border border-[#2a2a28] bg-[#141412] p-4">
					<div class="flex items-start gap-3">
						<div class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[#1e1e1c] text-[#d9a66c]">
							<Tag class="h-4 w-4" />
						</div>
						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
								<h4 class="text-base font-semibold text-[#f0eee4]">{releaseTitle(release)}</h4>
								<span class="font-mono text-xs text-[#8c887e]">{release.tag}</span>
								{#if release.latest}<span class="text-xs text-[#7cb97c]">Latest</span>{/if}
								{#if release.prerelease}<span class="text-xs text-[#d9a66c]">Prerelease</span>{/if}
								{#if release.draft}<span class="text-xs text-[#8c887e]">Draft</span>{/if}
							</div>
							<div class="mt-1 flex flex-wrap gap-2 text-xs text-[#6f6b5f]">
								{#if release.author && userName(release.author) !== 'Unknown user'}<span>{userName(release.author)}</span>{/if}
								{#if releaseDate(release)}<span>{releaseDate(release)}</span>{/if}
								{#if release.snapshot}<span class="inline-flex items-center gap-1 font-mono"><GitCommit class="h-3 w-3" />{release.snapshot.slice(0, 12)}</span>{/if}
							</div>
						</div>
					</div>

					<div class="pl-11">
						{#if release.notes}
							<div class="rounded bg-[#0f0f0d] p-3">
								<Markdown source={release.notes} />
							</div>
						{:else}
							<p class="text-sm text-[#6f6b5f]">No release notes.</p>
						{/if}

						{#if release.snapshot}
							<a class="mt-3 flex items-start gap-2 rounded bg-[#0f0f0d] px-3 py-2 hover:bg-[#171714]" href={`/${tenant}/${project}/code?snapshot=${release.snapshot}`}>
								<GitCommit class="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#8c887e]" />
								<div class="min-w-0">
									<div class="text-sm text-[#eae9e4]">Source snapshot</div>
									<div class="mt-0.5 break-all font-mono text-[11px] text-[#6f6b5f]">{release.snapshot}</div>
								</div>
							</a>
						{/if}

						<div class="mt-3 grid gap-2">
							<div class="text-sm font-medium text-[#eae9e4]">Artifacts</div>
							{#each artifacts as artifact}
								{@const meta = artifactMeta(artifact)}
								{@const href = artifactHref(artifact)}
								<div class="flex items-start gap-2 rounded bg-[#0f0f0d] px-3 py-2">
									<Box class="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#8c887e]" />
									<div class="min-w-0 flex-1">
										{#if href}
											<a class="inline-flex max-w-full items-center gap-1 text-sm text-[#eae9e4] hover:text-[#d9a66c]" href={href}>
												<span class="truncate">{artifact.name}</span>
												<Download class="h-3 w-3 shrink-0" />
											</a>
										{:else}
											<div class="truncate text-sm text-[#eae9e4]">{artifact.name}</div>
										{/if}
										{#if meta}
											<div class="mt-0.5 break-all font-mono text-[11px] text-[#6f6b5f]">{meta}</div>
										{/if}
									</div>
								</div>
							{:else}
								<p class="text-xs text-[#6f6b5f]">No artifacts attached.</p>
							{/each}
						</div>
					</div>
				</section>
			{:else}
				<div class="rounded border border-[#2a2a28] bg-[#141412] p-8 text-center">
					<p class="text-sm text-[#8c887e]">No releases yet.</p>
				</div>
			{/each}
		</div>
		<PaginationControls data={releaseData} onPage={(page) => (releasePage = page)} />
	{/if}
</div>
