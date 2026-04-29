<script lang="ts">
	import {
		createAccountKey,
		deleteAccountKey,
		isAbortError,
		listAccountKeys,
		type AccountKey
	} from '$lib/api';
	import SettingsKeys from '$lib/components/SettingsKeys.svelte';
	import Spinner from '$lib/components/Spinner.svelte';

	let loading = $state(true);
	let busy = $state(false);
	let error = $state('');
	let signingKeys = $state<AccountKey[]>([]);
	let signingKeyName = $state('');
	let signingKeyBody = $state('');

	async function load(signal?: AbortSignal) {
		loading = true;
		error = '';
		try {
			const signing = await listAccountKeys('signing_key', { all: true, signal });
			signingKeys = signing.items;
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
</script>

<div class="mx-auto max-w-2xl px-8 py-10">
	<div class="mb-6">
		<h3 class="text-lg font-semibold text-[#f0eee4]">User settings</h3>
		<p class="mt-1 text-sm text-[#8c887e]">Signing keys are used to verify snapshots you publish.</p>
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
			<SettingsKeys
				{signingKeys}
				{busy}
				bind:signingKeyName
				bind:signingKeyBody
				{addSigningKey}
				{removeKey}
			/>
		</div>
	{/if}
</div>
