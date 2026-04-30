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
			const next = localStorage.getItem('sty_post_login') || '/';
			localStorage.removeItem('sty_post_login');
			await goto(next, { replaceState: true, invalidateAll: true });
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
