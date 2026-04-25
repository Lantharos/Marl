<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { finishLogin, getStyToken, hydrateSession } from '$lib/session';

	let message = $state('Finishing sign in');

	onMount(async () => {
		try {
			await finishLogin();
			await hydrateSession();
			await getStyToken();
			await goto('/');
		} catch (error) {
			message = error instanceof Error ? error.message : 'Sign in failed';
		}
	});
</script>

<main class="min-h-screen px-6 py-10 text-[#171714]">
	<div class="mx-auto max-w-4xl">
		<p class="text-sm text-[#6f6b5f]">{message}</p>
	</div>
</main>
