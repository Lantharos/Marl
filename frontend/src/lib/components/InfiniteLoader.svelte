<script lang="ts">
	import Loader2 from 'lucide-svelte/icons/loader-2';

	let { active, onVisible }: { active: boolean; onVisible: () => void } = $props();
	let node = $state<HTMLElement | null>(null);

	$effect(() => {
		if (!active || !node) return;
		const observer = new IntersectionObserver((items) => {
			if (items.some((item) => item.isIntersecting)) onVisible();
		}, { rootMargin: '240px 0px' });
		observer.observe(node);
		return () => observer.disconnect();
	});
</script>

{#if active}
	<div bind:this={node} class="grid place-items-center py-6 text-xs text-[#6f6b5f]">
		<Loader2 class="mb-2 h-4 w-4 animate-spin" />
		Loading more
	</div>
{/if}
