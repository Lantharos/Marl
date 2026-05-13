<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onDestroy } from 'svelte';
	import { createTenantLeaf, type LeafDraft } from '$lib/api';
	import { appData } from '$lib/appState';
	import LeafEditor from '$lib/components/LeafEditor.svelte';

	const tenant = $derived($page.params.tenant as string);

	let busy = $state(false);
	let error = $state('');
	let tenantNames = $state<string[]>([]);

	const canWrite = $derived(tenantNames.includes(tenant));
	const unsubscribe = appData.subscribe((value) => {
		tenantNames = value.me?.tenants.map((item) => item.name) ?? [];
	});

	onDestroy(unsubscribe);

	async function saveLeaf(draft: LeafDraft) {
		if (busy) return;
		if (!canWrite) {
			error = 'You do not have access to create leaves for this tenant';
			return;
		}
		busy = true;
		error = '';
		try {
			const leaf = await createTenantLeaf(tenant, { ...draft, attached_type: draft.attached_type ?? 'tenant' });
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
		<p class="mt-1 text-sm text-[#8c887e]">Attach a tenant note, setup command, deployment detail, or public snippet.</p>
	</div>

	{#if error}
		<div class="mb-4 border border-[#4a2a24] bg-[#1a1110] px-3 py-2 text-sm text-[#d96c5a]">{error}</div>
	{/if}

	<LeafEditor
		submitLabel="Create leaf"
		{busy}
		canPin={canWrite}
		defaultAttachment="tenant"
		onSave={saveLeaf}
		onCancel={() => goto(`/${tenant}/leaves`)}
	/>
</div>
