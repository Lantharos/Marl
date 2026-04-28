<script lang="ts">
	import type { CapabilityResponse } from '$lib/api';

	let { capabilities }: { capabilities: CapabilityResponse | null } = $props();
</script>

<div class="rounded border border-[#2a2a28] bg-[#141412] p-4">
	<div class="text-sm font-medium text-[#eae9e4]">Project features</div>
	<div class="mt-3 flex flex-wrap gap-1.5">
		{#each capabilities?.capabilities ?? [] as capability}
			<span class="rounded bg-[#1e1e1c] px-2 py-1 text-xs text-[#a09d94]">{capability.replace('_', ' ')}</span>
		{:else}
			<span class="text-xs text-[#6f6b5f]">No feature handshake available.</span>
		{/each}
	</div>
</div>
