<script lang="ts">
	import FileDiffCard from './FileDiffCard.svelte';

	let {
		files,
		oldTexts,
		newTexts
	}: {
		files: { path: string; change_type: string }[];
		oldTexts: Map<string, string | null>;
		newTexts: Map<string, string | null>;
	} = $props();
</script>

<div class="grid gap-4">
	{#each files as file}
		<FileDiffCard path={file.path} oldText={oldTexts.get(file.path) ?? null} newText={newTexts.get(file.path) ?? null} />
	{:else}
		<p class="text-sm text-[#6f6b5f]">No file changes available.</p>
	{/each}
</div>
