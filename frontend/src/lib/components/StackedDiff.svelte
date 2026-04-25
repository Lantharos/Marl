<script lang="ts">
	import type { ChangedFile } from '$lib/api';
	import FileDiffCard from './FileDiffCard.svelte';

	let { files }: { files: ChangedFile[] } = $props();
</script>

<div class="grid gap-4">
	{#each files as file}
		<FileDiffCard {file} />
	{:else}
		<p class="text-sm text-[#6f6b5f]">No file changes available.</p>
	{/each}
</div>
