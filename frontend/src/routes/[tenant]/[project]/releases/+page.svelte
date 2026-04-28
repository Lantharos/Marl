<script lang="ts">
	import { page } from '$app/stores';
	import { createRelease, createTag, isAbortError, listReleasesPage, listTags, type Paginated, type Release, type TagInfo } from '$lib/api';
	import PaginationControls from '$lib/components/PaginationControls.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import { userName } from '$lib/identity';
	import Plus from 'lucide-svelte/icons/plus';
	import Tag from 'lucide-svelte/icons/tag';

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
	let busy = $state(false);
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
		try {
			if (!exactTag) {
				await createTag(tenant, project, { id: tagName, tag: tagName, name: tagName });
			}
			await createRelease(tenant, project, { tag: tagName, name: name.trim() || tagName, notes: notes.trim() || null });
			tag = '';
			name = '';
			notes = '';
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
	<div class="mb-4 flex items-center justify-between gap-4">
		<div>
			<h3 class="text-sm font-semibold text-[#f0eee4]">Releases</h3>
			<p class="mt-1 text-xs text-[#6f6b5f]">Published notes for existing ship tags.</p>
		</div>
		<button class="inline-flex items-center gap-1 rounded bg-[#eae9e4] px-3 py-1.5 text-xs font-medium text-[#0f0f0d] hover:bg-[#d9d5c6]" onclick={() => (showForm = !showForm)}>
			<Plus class="h-3.5 w-3.5" /> New release
		</button>
	</div>

	{#if showForm}
		<div class="mb-4 grid gap-3 rounded bg-[#141412] p-4">
			<div class="grid gap-3 md:grid-cols-2">
				<div class="grid gap-2">
					<input class="rounded bg-[#0f0f0d] px-3 py-2 text-sm text-[#eae9e4] outline-none" placeholder="Tag" bind:value={tag} />
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
				<input class="rounded bg-[#0f0f0d] px-3 py-2 text-sm text-[#eae9e4] outline-none" placeholder="Name" bind:value={name} />
			</div>
			<textarea class="min-h-[110px] resize-y rounded bg-[#0f0f0d] px-3 py-2 text-sm text-[#eae9e4] outline-none" placeholder="Notes" bind:value={notes}></textarea>
			<div class="flex justify-end gap-2">
				<button class="px-3 py-1.5 text-xs text-[#a09d94] hover:text-[#eae9e4]" onclick={() => (showForm = false)}>Cancel</button>
				<button class="rounded bg-[#eae9e4] px-3 py-1.5 text-xs font-medium text-[#0f0f0d]" disabled={busy || !tag.trim()} onclick={handleCreate}>Create</button>
			</div>
		</div>
	{/if}

	{#if loading}
		<Spinner />
	{:else if error}
		<div class="text-sm text-[#d96c5a]">{error}</div>
	{:else}
		<div class="divide-y divide-[#252522] overflow-hidden rounded bg-[#141412]">
			{#each releases as release}
				<div class="flex items-start gap-3 px-4 py-4">
					<Tag class="mt-0.5 h-4 w-4 shrink-0 text-[#d9a66c]" />
					<div class="min-w-0 flex-1">
						<div class="flex flex-wrap items-center gap-2">
							<div class="text-sm font-medium text-[#f0eee4]">{release.name ?? release.tag}</div>
							<div class="font-mono text-xs text-[#8c887e]">{release.tag}</div>
						</div>
						{#if release.notes}
							<p class="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#c7c4ba]">{release.notes}</p>
						{/if}
						<div class="mt-2 flex flex-wrap gap-2 text-xs text-[#6f6b5f]">
							{#if release.author && userName(release.author) !== 'Unknown user'}<span>{userName(release.author)}</span>{/if}
							{#if release.snapshot}<span class="font-mono">{release.snapshot.slice(0, 12)}</span>{/if}
							{#if release.created_at}<span>{new Date(release.created_at).toLocaleDateString()}</span>{/if}
						</div>
					</div>
				</div>
			{:else}
				<div class="rounded border border-[#2a2a28] bg-[#141412] p-8 text-center">
					<p class="text-sm text-[#8c887e]">No releases yet.</p>
				</div>
			{/each}
		</div>
		<PaginationControls data={releaseData} onPage={(page) => (releasePage = page)} />
	{/if}
</div>
