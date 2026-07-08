<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import {
		getRelease,
		getProjectSettings,
		isAbortError,
		listReleasesPage,
		listTags,
		updateRelease,
		uploadReleaseArtifact,
		type ProjectComponent,
		type Release,
		type TagInfo
	} from '$lib/api';
	import ReleaseComposer, { type ReleaseCreateInput } from '$lib/components/ReleaseComposer.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import { getProjectHistory, type HistoryEntry } from '$lib/projectDataApi';

	const tenant = $derived($page.params.tenant as string);
	const project = $derived($page.params.project as string);
	const releaseId = $derived($page.params.release as string);

	let release = $state<Release | null>(null);
	let releases = $state<Release[]>([]);
	let tags = $state<TagInfo[]>([]);
	let components = $state<ProjectComponent[]>([]);
	let loading = $state(true);
	let busy = $state(false);
	let error = $state('');

	$effect(() => {
		if (!tenant || !project || !releaseId) return;
		const controller = new AbortController();
		load(controller.signal);
		return () => controller.abort();
	});

	async function load(signal?: AbortSignal) {
		loading = true;
		error = '';
		try {
			const [releaseResult, releasePage, tagResult, settingsResult] = await Promise.all([
				getRelease(tenant, project, releaseId, { signal }),
				listReleasesPage(tenant, project, { page: 1, perPage: 500, signal }),
				listTags(tenant, project, { page: 1, perPage: 500, signal }).catch(() => null),
				getProjectSettings(tenant, project, { signal }).catch(() => null)
			]);
			release = releaseResult;
			releases = releasePage.items;
			tags = tagResult?.items ?? [];
			components = settingsResult?.components ?? [];
		} catch (e) {
			if (isAbortError(e)) return;
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			if (!signal?.aborted) loading = false;
		}
	}

	async function handleUpdate(input: ReleaseCreateInput) {
		if (!release) return;
		busy = true;
		error = '';
		const id = release.id ?? release.tag;
		try {
			const updated = await updateRelease(tenant, project, id, {
				name: input.name,
				notes: input.notes || null,
				prerelease: input.prerelease,
				draft: input.draft,
				components: input.components,
				latest: !input.draft && !input.prerelease && Boolean(release.latest || release.draft)
			});
			const releaseStorageId = updated.id ?? id;
			for (const file of input.files) {
				await uploadReleaseArtifact(tenant, project, releaseStorageId, file);
			}
			await goto(`/${tenant}/${project}/releases`);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
			throw e;
		} finally {
			busy = false;
		}
	}

	async function generateNotes() {
		const history = await getProjectHistory(tenant, project, { limit: 80 });
		const changes = releaseChanges(history);
		if (!changes.length) return '## Changes\n\n- No main workspace saves found.';
		return `## Changes\n\n${changes.map((entry) => `- ${cleanHistoryMessage(entry.message)}${entry.snapshot_id ? ` (${entry.snapshot_id.slice(0, 12)})` : ''}`).join('\n')}`;
	}

	function releaseChanges(history: HistoryEntry[]) {
		const snapshot = release?.snapshot ?? release?.source?.snapshot;
		const mainHistory = history.filter((entry) => entry.workspace === 'main' && entry.snapshot_id && entry.kind !== 'ready');
		if (!snapshot) return mainHistory.slice(0, 20);
		const latestIndex = mainHistory.findIndex((entry) => entry.snapshot_id === snapshot);
		return (latestIndex >= 0 ? mainHistory.slice(0, latestIndex + 1) : mainHistory).slice(0, 20);
	}

	function cleanHistoryMessage(message: string | null | undefined) {
		const value = (message ?? '').trim();
		return value || 'Saved changes';
	}
</script>

<div class="mx-auto max-w-6xl">
	<div class="mb-5">
		<h1 class="text-xl font-semibold text-[#f0eee4]">Edit release</h1>
		<p class="mt-1 text-sm text-[#8c887e]">Update notes, publish drafts, and attach release files.</p>
	</div>

	{#if loading}
		<Spinner />
	{:else}
		{#if error}
			<div class="mb-4 border border-[#2a2a28] bg-[#141412] p-4 text-sm text-[#d96c5a]">{error}</div>
		{/if}
		{#if release}
			<ReleaseComposer mode="edit" initialRelease={release} {tags} {releases} projectComponents={components} {busy} onCreate={handleUpdate} onCancel={() => goto(`/${tenant}/${project}/releases`)} onGenerateNotes={generateNotes} />
		{/if}
	{/if}
</div>
