<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import {
		createRelease,
		getProjectSettings,
		isAbortError,
		listReleasesPage,
		listTags,
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

	let releases = $state<Release[]>([]);
	let tags = $state<TagInfo[]>([]);
	let components = $state<ProjectComponent[]>([]);
	let loading = $state(true);
	let busy = $state(false);
	let error = $state('');

	$effect(() => {
		if (!tenant || !project) return;
		const controller = new AbortController();
		load(controller.signal);
		return () => controller.abort();
	});

	async function load(signal?: AbortSignal) {
		loading = true;
		error = '';
		try {
			const [releaseResult, tagResult, settingsResult] = await Promise.all([
				listReleasesPage(tenant, project, { page: 1, perPage: 500, signal }),
				listTags(tenant, project, { page: 1, perPage: 500, signal }).catch(() => null),
				getProjectSettings(tenant, project, { signal }).catch(() => null)
			]);
			releases = releaseResult.items;
			tags = tagResult?.items ?? [];
			components = settingsResult?.components ?? [];
		} catch (e) {
			if (isAbortError(e)) return;
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			if (!signal?.aborted) loading = false;
		}
	}

	async function handleCreate(input: ReleaseCreateInput) {
		busy = true;
		error = '';
		try {
			const release = await createRelease(tenant, project, {
				tag: input.tag,
				name: input.name,
				notes: input.notes || null,
				prerelease: input.prerelease,
				draft: input.draft,
				components: input.components,
				latest: !input.draft && !input.prerelease
			});
			const releaseId = release.id ?? input.tag;
			for (const file of input.files) {
				await uploadReleaseArtifact(tenant, project, releaseId, file);
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
		const changes = releaseChangesSinceLastPublished(history);
		if (!changes.length) return '## Changes\n\n- No main workspace saves found since the previous release.';
		return `## Changes\n\n${changes.map((entry) => `- ${cleanHistoryMessage(entry.message)}${entry.snapshot_id ? ` (${entry.snapshot_id.slice(0, 12)})` : ''}`).join('\n')}`;
	}

	function releaseChangesSinceLastPublished(history: HistoryEntry[]) {
		const latestPublished = releases.find((release) => !release.draft && !release.prerelease && release.snapshot);
		const mainHistory = history.filter((entry) => entry.workspace === 'main' && entry.snapshot_id && entry.kind !== 'ready');
		if (!latestPublished?.snapshot) return mainHistory.slice(0, 20);
		const latestIndex = mainHistory.findIndex((entry) => entry.snapshot_id === latestPublished.snapshot);
		return (latestIndex >= 0 ? mainHistory.slice(0, latestIndex) : mainHistory).slice(0, 20);
	}

	function cleanHistoryMessage(message: string | null | undefined) {
		const value = (message ?? '').trim();
		return value || 'Saved changes';
	}
</script>

<div class="mx-auto max-w-6xl">
	<div class="mb-5">
		<h1 class="text-xl font-semibold text-[#f0eee4]">Create new release</h1>
		<p class="mt-1 text-sm text-[#8c887e]">Tag a version, add release notes, and attach files before publishing.</p>
	</div>

	{#if loading}
		<Spinner />
	{:else}
		{#if error}
			<div class="mb-4 border border-[#2a2a28] bg-[#141412] p-4 text-sm text-[#d96c5a]">{error}</div>
		{/if}
		<ReleaseComposer {tags} {releases} projectComponents={components} {busy} onCreate={handleCreate} onCancel={() => goto(`/${tenant}/${project}/releases`)} onGenerateNotes={generateNotes} />
	{/if}
</div>
