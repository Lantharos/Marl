<script lang="ts">
	import { page } from '$app/stores';
	import {
		createProtocolItem,
		deleteProtocolItem,
		isAbortError,
		listProtocolItems,
		type ProtocolItem
	} from '$lib/api';
	import Spinner from '$lib/components/Spinner.svelte';
	import SettingsAutomation from '$lib/components/SettingsAutomation.svelte';

	const tenant = $derived($page.params.tenant as string);
	const project = $derived($page.params.project as string);

	let loading = $state(true);
	let error = $state('');
	let busy = $state(false);
	let hooks = $state<ProtocolItem[]>([]);
	let webhooks = $state<ProtocolItem[]>([]);
	let hookEvent = $state('workspace.ready');
	let hookUrl = $state('');
	let webhookEvent = $state('snapshot.saved');
	let webhookUrl = $state('');

	async function load(signal?: AbortSignal) {
		loading = true;
		error = '';
		try {
			const [hookData, webhookData] = await Promise.all([
				listProtocolItems(tenant, project, 'hook', signal ? { signal } : {}).catch(() => ({ items: [] })),
				listProtocolItems(tenant, project, 'webhook', signal ? { signal } : {}).catch(() => ({ items: [] }))
			]);
			hooks = hookData.items;
			webhooks = webhookData.items;
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

	async function addHook(kind: 'hook' | 'webhook') {
		const event = kind === 'hook' ? hookEvent : webhookEvent;
		const url = kind === 'hook' ? hookUrl : webhookUrl;
		if (!event.trim() || !url.trim()) return;
		busy = true;
		try {
			await createProtocolItem(tenant, project, kind, { event: event.trim(), url: url.trim() });
			if (kind === 'hook') hookUrl = '';
			if (kind === 'webhook') webhookUrl = '';
			await load();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			busy = false;
		}
	}

	async function removeProtocolItem(kind: string, id: string) {
		busy = true;
		try {
			await deleteProtocolItem(tenant, project, kind, id);
			await load();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			busy = false;
		}
	}
</script>

<div class="mx-auto max-w-xl">
	<h3 class="mb-4 text-sm font-semibold text-[#f0eee4]">Automation</h3>

	{#if loading}
		<Spinner />
	{:else if error}
		<div class="text-sm text-[#d96c5a]">{error}</div>
	{:else}
		<SettingsAutomation
			{hooks}
			{webhooks}
			{busy}
			bind:hookEvent
			bind:hookUrl
			bind:webhookEvent
			bind:webhookUrl
			{addHook}
			{removeProtocolItem}
		/>
	{/if}
</div>
