<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onDestroy } from 'svelte';
	import {
		deleteProjectLeaf,
		getProjectLeaf,
		isAbortError,
		updateProjectLeaf,
		type Leaf,
		type LeafDraft
	} from '$lib/api';
	import LeafEditor from '$lib/components/LeafEditor.svelte';
	import Markdown from '$lib/components/Markdown.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import UserProfileLink from '$lib/components/UserProfileLink.svelte';
	import { currentProjectAccess } from '$lib/projectAccessStore';
	import ArrowLeft from 'lucide-svelte/icons/arrow-left';
	import Globe2 from 'lucide-svelte/icons/globe-2';
	import LockKeyhole from 'lucide-svelte/icons/lock-keyhole';
	import Pencil from 'lucide-svelte/icons/pencil';
	import Pin from 'lucide-svelte/icons/pin';
	import Trash2 from 'lucide-svelte/icons/trash-2';
	import Users from 'lucide-svelte/icons/users';

	const tenant = $derived($page.params.tenant as string);
	const project = $derived($page.params.project as string);
	const leafParam = $derived($page.params.leaf as string);

	let leaf = $state<Leaf | null>(null);
	let loading = $state(true);
	let busy = $state(false);
	let deleting = $state(false);
	let deleteArmed = $state(false);
	let editing = $state(false);
	let error = $state('');
	let canWrite = $state(false);
	let canMaintain = $state(false);

	const unsubscribe = currentProjectAccess.subscribe((value) => {
		canWrite = Boolean(value?.can_write && !value.archived);
		canMaintain = Boolean(value?.can_maintain && !value.archived);
	});

	onDestroy(unsubscribe);

	$effect(() => {
		if (!tenant || !project || !leafParam) return;
		const controller = new AbortController();
		void load(controller.signal);
		return () => controller.abort();
	});

	async function load(signal?: AbortSignal) {
		loading = true;
		error = '';
		try {
			leaf = await getProjectLeaf(tenant, project, leafParam, { signal });
		} catch (e) {
			if (isAbortError(e)) return;
			error = e instanceof Error ? e.message : 'Leaf not found';
		} finally {
			if (!signal?.aborted) loading = false;
		}
	}

	async function saveLeaf(draft: LeafDraft) {
		if (!leaf || busy) return;
		busy = true;
		error = '';
		try {
			leaf = await updateProjectLeaf(tenant, project, leaf.slug, draft);
			editing = false;
			if (leaf.slug !== leafParam) {
				await goto(`/${tenant}/${project}/leaves/${leaf.slug}`, { replaceState: true });
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not save leaf';
		} finally {
			busy = false;
		}
	}

	async function togglePin() {
		if (!leaf || busy) return;
		busy = true;
		try {
			leaf = await updateProjectLeaf(tenant, project, leaf.slug, { pinned: !leaf.pinned });
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not update leaf';
		} finally {
			busy = false;
		}
	}

	async function removeLeaf() {
		if (!leaf || deleting) return;
		if (!deleteArmed) {
			deleteArmed = true;
			return;
		}
		deleting = true;
		try {
			await deleteProjectLeaf(tenant, project, leaf.slug);
			await goto(`/${tenant}/${project}/leaves`);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not delete leaf';
		} finally {
			deleting = false;
		}
	}

	function formatDate(value: string | undefined) {
		if (!value) return '';
		const date = new Date(value);
		return Number.isNaN(date.valueOf()) ? '' : date.toLocaleString();
	}
</script>

<div class="mx-auto max-w-4xl">
	<a class="mb-4 inline-flex items-center gap-2 text-sm text-[#8c887e] hover:text-[#d9a66c]" href={`/${tenant}/${project}/leaves`}>
		<ArrowLeft class="h-4 w-4" /> Leaves
	</a>

	{#if loading}
		<Spinner />
	{:else if error && !leaf}
		<div class="border border-[#4a2a24] bg-[#1a1110] p-4 text-sm text-[#d96c5a]">{error}</div>
	{:else if leaf}
		{#if editing}
			<LeafEditor {leaf} submitLabel="Save leaf" {busy} canPin={canMaintain} onSave={saveLeaf} onCancel={() => (editing = false)} />
		{:else}
			<article class="border border-[#2a2a28] bg-[#141412]">
				<header class="border-b border-[#252522] p-5">
					<div class="flex flex-wrap items-start justify-between gap-4">
						<div class="min-w-0">
							<h1 class="text-2xl font-semibold text-[#f0eee4]">{leaf.title}</h1>
								<div class="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#8c887e]">
									<span class="inline-flex items-center gap-1">
										{#if leaf.visibility === 'public'}
											<Globe2 class="h-3.5 w-3.5" />
										{:else if leaf.visibility === 'private'}
											<LockKeyhole class="h-3.5 w-3.5" />
										{:else}
											<Users class="h-3.5 w-3.5" />
										{/if}
										{leaf.visibility}
									</span>
								<span>{leaf.attached_type}{leaf.attached_id ? `:${leaf.attached_id}` : ''}</span>
								<span>updated {formatDate(leaf.updated_at)}</span>
								<UserProfileLink user={leaf.author} profile={leaf.author_profile} />
							</div>
						</div>
						<div class="flex shrink-0 items-center gap-2">
							{#if canMaintain}
								<button class="grid h-8 w-8 place-items-center border border-[#2a2a28] bg-[#1e1e1c] {leaf.pinned ? 'text-[#d9a66c]' : 'text-[#a09d94] hover:text-[#eae9e4]'}" type="button" aria-label="Pin leaf" onclick={togglePin}>
									<Pin class="h-3.5 w-3.5" />
								</button>
							{/if}
							{#if canWrite}
								<button class="grid h-8 w-8 place-items-center border border-[#2a2a28] bg-[#1e1e1c] text-[#a09d94] hover:text-[#eae9e4]" type="button" aria-label="Edit leaf" onclick={() => (editing = true)}>
									<Pencil class="h-3.5 w-3.5" />
								</button>
								<button
									class="inline-flex h-8 items-center gap-2 border border-[#2a2a28] bg-[#1e1e1c] px-2 text-xs {deleteArmed ? 'border-[#5d2a24] text-[#d96c5a]' : 'text-[#a09d94] hover:text-[#d96c5a]'}"
									type="button"
									disabled={deleting}
									onclick={removeLeaf}
								>
									<Trash2 class="h-3.5 w-3.5" />
									{#if deleteArmed}<span>{deleting ? 'Deleting...' : 'Confirm'}</span>{/if}
								</button>
							{/if}
						</div>
					</div>
					{#if leaf.tags.length}
						<div class="mt-4 flex flex-wrap gap-2">
							{#each leaf.tags as tag (tag)}
								<span class="border border-[#2a2a28] bg-[#0f0f0d] px-2 py-1 text-xs text-[#d9a66c]">#{tag}</span>
							{/each}
						</div>
					{/if}
				</header>
				<div class="p-5">
					{#if leaf.body.trim()}
						<Markdown source={leaf.body} />
					{:else}
						<p class="text-sm text-[#6f6b5f]">This leaf is empty.</p>
					{/if}
				</div>
			</article>
			{#if error}
				<div class="mt-4 border border-[#4a2a24] bg-[#1a1110] px-3 py-2 text-sm text-[#d96c5a]">{error}</div>
			{/if}
		{/if}
	{/if}
</div>
