<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onDestroy } from 'svelte';
	import { createProjectLeaf, type LeafDraft } from '$lib/api';
	import LeafEditor from '$lib/components/LeafEditor.svelte';
	import { currentProjectAccess } from '$lib/projectAccessStore';

	const tenant = $derived($page.params.tenant as string);
	const project = $derived($page.params.project as string);

	let busy = $state(false);
	let error = $state('');
	let canWrite = $state(false);
	let canMaintain = $state(false);

	const unsubscribe = currentProjectAccess.subscribe((value) => {
		canWrite = Boolean(value?.can_write && !value.archived);
		canMaintain = Boolean(value?.can_maintain && !value.archived);
	});

	onDestroy(unsubscribe);

	async function saveLeaf(draft: LeafDraft) {
		if (busy) return;
		if (!canWrite) {
			error = 'You do not have access to create leaves for this project';
			return;
		}
		busy = true;
		error = '';
		try {
			const leaf = await createProjectLeaf(tenant, project, draft);
			await goto(leaf.href);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not create leaf';
		} finally {
			busy = false;
		}
	}
</script>

<div class="mx-auto max-w-5xl">
	<div class="mb-5">
		<h1 class="text-xl font-semibold text-[#f0eee4]">New leaf</h1>
		<p class="mt-1 text-sm text-[#8c887e]">Attach a note or snippet to this project, a workspace, an issue, or a release.</p>
	</div>

	{#if error}
		<div class="mb-4 border border-[#4a2a24] bg-[#1a1110] px-3 py-2 text-sm text-[#d96c5a]">{error}</div>
	{/if}

	<LeafEditor
		submitLabel="Create leaf"
		{busy}
		canPin={canMaintain}
		defaultAttachment="project"
		onSave={saveLeaf}
		onCancel={() => goto(`/${tenant}/${project}/leaves`)}
	/>
</div>
