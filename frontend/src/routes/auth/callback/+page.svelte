<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import { finishLogin, getStyToken, hydrateSession } from '$lib/session';
	import Spinner from '$lib/components/Spinner.svelte';

	let errorMessage = $state('');

	onMount(async () => {
		try {
			await finishLogin();
			await hydrateSession();
			await getStyToken();
			await invalidateAll();
			await goto('/', { replaceState: true, invalidateAll: true });
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Sign in failed';
		}
	});
</script>

<main class="grid min-h-screen place-items-center bg-[#0f0f0d] px-6">
	{#if errorMessage}
		<p class="max-w-md text-center text-sm text-[#d96c5a]">{errorMessage}</p>
	{:else}
		<Spinner />
	{/if}
</main>
