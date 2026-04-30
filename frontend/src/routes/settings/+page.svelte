<script lang="ts">
	import {
		createAccountKey,
		createDeveloperApp,
		deleteAccountKey,
		deleteDeveloperApp,
		isAbortError,
		listDeveloperApps,
		listAccountKeys,
		type AccountKey,
		type DeveloperApp
	} from '$lib/api';
	import SettingsDeveloperApps from '$lib/components/SettingsDeveloperApps.svelte';
	import SettingsKeys from '$lib/components/SettingsKeys.svelte';
	import Spinner from '$lib/components/Spinner.svelte';

	let tab = $state<'signing' | 'developer'>('signing');
	let loading = $state(true);
	let busy = $state(false);
	let error = $state('');
	let signingKeys = $state<AccountKey[]>([]);
	let apps = $state<DeveloperApp[]>([]);
	let createdApp = $state<DeveloperApp | null>(null);
	let signingKeyName = $state('');
	let signingKeyBody = $state('');
	let appName = $state('');
	let redirectUri = $state('');
	let homepageUrl = $state('');
	let description = $state('');

	async function load(signal?: AbortSignal) {
		loading = true;
		error = '';
		try {
			const [signing, developerApps] = await Promise.all([
				listAccountKeys('signing_key', { all: true, signal }),
				listDeveloperApps({ all: true, signal })
			]);
			signingKeys = signing.items;
			apps = developerApps.items;
		} catch (e) {
			if (isAbortError(e)) return;
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			if (!signal?.aborted) loading = false;
		}
	}

	$effect(() => {
		const controller = new AbortController();
		load(controller.signal);
		return () => controller.abort();
	});

	async function addSigningKey() {
		if (!signingKeyName.trim() || !signingKeyBody.trim()) return;
		busy = true;
		error = '';
		try {
			await createAccountKey('signing_key', {
				name: signingKeyName.trim(),
				public_key: signingKeyBody.trim(),
				algorithm: 'ed25519'
			});
			signingKeyName = '';
			signingKeyBody = '';
			await load();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			busy = false;
		}
	}

	async function removeKey(kind: 'signing_key', id: string) {
		busy = true;
		error = '';
		try {
			await deleteAccountKey(kind, id);
			await load();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			busy = false;
		}
	}

	async function addApp() {
		if (!appName.trim() || !redirectUri.trim()) return;
		busy = true;
		error = '';
		try {
			createdApp = await createDeveloperApp({
				name: appName.trim(),
				redirect_uri: redirectUri.trim(),
				homepage_url: homepageUrl.trim() || null,
				description: description.trim() || null
			});
			appName = '';
			redirectUri = '';
			homepageUrl = '';
			description = '';
			await load();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			busy = false;
		}
	}

	async function removeApp(id: string) {
		busy = true;
		error = '';
		try {
			await deleteDeveloperApp(id);
			await load();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			busy = false;
		}
	}
</script>

<div class="mx-auto max-w-2xl px-8 py-10">
	<div class="mb-6">
		<h3 class="text-lg font-semibold text-[#f0eee4]">User settings</h3>
		<p class="mt-1 text-sm text-[#8c887e]">Signing keys and developer access for your account.</p>
		<div class="mt-4 flex gap-1 border-b border-[#2a2a28]">
			<button class="px-3 py-2 text-sm {tab === 'signing' ? 'border-b border-[#d9a66c] text-[#eae9e4]' : 'text-[#8c887e] hover:text-[#eae9e4]'}" onclick={() => (tab = 'signing')}>
				Signing
			</button>
			<button class="px-3 py-2 text-sm {tab === 'developer' ? 'border-b border-[#d9a66c] text-[#eae9e4]' : 'text-[#8c887e] hover:text-[#eae9e4]'}" onclick={() => (tab = 'developer')}>
				Developer
			</button>
		</div>
	</div>

	{#if loading}
		<div class="flex min-h-[220px] items-center justify-center">
			<Spinner />
		</div>
	{:else}
		<div class="grid gap-4">
			{#if error}
				<div class="text-sm text-[#d96c5a]">{error}</div>
			{/if}
			{#if tab === 'signing'}
				<SettingsKeys
					{signingKeys}
					{busy}
					bind:signingKeyName
					bind:signingKeyBody
					{addSigningKey}
					{removeKey}
				/>
			{:else}
				<SettingsDeveloperApps
					{apps}
					{busy}
					{createdApp}
					bind:appName
					bind:redirectUri
					bind:homepageUrl
					bind:description
					{addApp}
					{removeApp}
				/>
			{/if}
		</div>
	{/if}
</div>
