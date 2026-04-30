<script lang="ts">
	import { page } from '$app/stores';
	import {
		createProjectApiKey,
		createProjectWebhook,
		deleteProjectApiKey,
		deleteProjectIntegration,
		deleteProjectWebhook,
		isAbortError,
		listProjectApiKeys,
		listProjectIntegrations,
		listProjectWebhooks,
		testProjectWebhook,
		type ProjectApiKey,
		type ProjectIntegration,
		type ProjectWebhook
	} from '$lib/api';
	import SettingsAutomation from '$lib/components/SettingsAutomation.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import { currentProjectAccess } from '$lib/projectAccessStore';
	import { onDestroy } from 'svelte';

	const tenant = $derived($page.params.tenant as string);
	const project = $derived($page.params.project as string);

	let loading = $state(true);
	let error = $state('');
	let busy = $state(false);
	let apiKeys = $state<ProjectApiKey[]>([]);
	let webhooks = $state<ProjectWebhook[]>([]);
	let integrations = $state<ProjectIntegration[]>([]);
	let keyName = $state('');
	let keyScopes = $state<string[]>([
		'workspaces:read',
		'workspaces:create',
		'workspaces:write',
		'workspaces:ready'
	]);
	let generatedKey = $state<ProjectApiKey | null>(null);
	let webhookName = $state('');
	let webhookUrl = $state('');
	let webhookEvents = $state<string[]>(['snapshot.shipped', 'release.created']);
	let createdWebhook = $state<ProjectWebhook | null>(null);
	let testMessage = $state('');
	let canMaintain = $state(false);

	const unsubscribe = currentProjectAccess.subscribe((value) => {
		canMaintain = Boolean(value?.can_maintain && !value?.archived);
	});

	onDestroy(unsubscribe);

	async function load(signal?: AbortSignal) {
		loading = true;
		error = '';
		try {
			const [keys, hooks, apps] = await Promise.all([
				listProjectApiKeys(tenant, project, { all: true, signal }),
				listProjectWebhooks(tenant, project, { all: true, signal }),
				listProjectIntegrations(tenant, project, { all: true, signal })
			]);
			apiKeys = keys.items;
			webhooks = hooks.items;
			integrations = apps.items;
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

	async function addApiKey() {
		if (!keyName.trim()) return;
		busy = true;
		error = '';
		try {
			generatedKey = await createProjectApiKey(tenant, project, {
				name: keyName.trim(),
				scopes: keyScopes
			});
			keyName = '';
			await load();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			busy = false;
		}
	}

	async function removeApiKey(id: string) {
		busy = true;
		error = '';
		try {
			await deleteProjectApiKey(tenant, project, id);
			await load();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			busy = false;
		}
	}

	async function addWebhook() {
		if (!webhookName.trim() || !webhookUrl.trim()) return;
		busy = true;
		error = '';
		testMessage = '';
		try {
			createdWebhook = await createProjectWebhook(tenant, project, {
				name: webhookName.trim(),
				url: webhookUrl.trim(),
				events: webhookEvents
			});
			webhookName = '';
			webhookUrl = '';
			await load();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			busy = false;
		}
	}

	async function removeWebhook(id: string) {
		busy = true;
		error = '';
		try {
			await deleteProjectWebhook(tenant, project, id);
			await load();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			busy = false;
		}
	}

	async function testWebhook(id: string) {
		busy = true;
		error = '';
		testMessage = '';
		try {
			const result = await testProjectWebhook(tenant, project, id);
			testMessage = result.ok ? `Webhook returned ${result.status}` : `Webhook failed with ${result.status || 'no response'}`;
			await load();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			busy = false;
		}
	}

	async function removeIntegration(id: string) {
		busy = true;
		error = '';
		try {
			await deleteProjectIntegration(tenant, project, id);
			await load();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			busy = false;
		}
	}
</script>

<div class="mx-auto max-w-3xl">
	<h3 class="mb-4 text-sm font-semibold text-[#f0eee4]">Automation</h3>

	{#if loading}
		<div class="flex min-h-[220px] items-center justify-center">
			<Spinner />
		</div>
	{:else if error}
		<div class="text-sm text-[#d96c5a]">{error}</div>
	{:else if !canMaintain}
		<div class="rounded border border-[#2a2a28] bg-[#141412] p-8 text-center">
			<p class="text-sm text-[#8c887e]">Project automation is limited to maintainers.</p>
		</div>
	{:else}
		<SettingsAutomation
			{apiKeys}
			{webhooks}
			{integrations}
			{busy}
			{generatedKey}
			{createdWebhook}
			bind:keyName
			bind:keyScopes
			bind:webhookName
			bind:webhookUrl
			bind:webhookEvents
			{testMessage}
			{addApiKey}
			{removeApiKey}
			{addWebhook}
			{removeWebhook}
			{testWebhook}
			{removeIntegration}
		/>
	{/if}
</div>
