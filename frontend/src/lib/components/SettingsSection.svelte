<script lang="ts">
	import ChevronDown from 'lucide-svelte/icons/chevron-down';

	let {
		title,
		description,
		open = false,
		actions,
		children
	}: {
		title: string;
		description?: string;
		open?: boolean;
		actions?: import('svelte').Snippet;
		children: import('svelte').Snippet;
	} = $props();

	let expanded = $state(false);

	$effect(() => {
		expanded = open;
	});
</script>

<section class="rounded border border-[#2a2a28] bg-[#141412]">
	<div class="flex items-center justify-between gap-3 p-4">
		<button class="flex min-w-0 flex-1 items-center gap-2 text-left" onclick={() => (expanded = !expanded)}>
			<ChevronDown class="h-4 w-4 shrink-0 text-[#6f6b5f] transition-transform {expanded ? '' : '-rotate-90'}" />
			<span class="min-w-0">
				<span class="block text-sm font-medium text-[#eae9e4]">{title}</span>
				{#if description}
					<span class="mt-1 block text-xs text-[#6f6b5f]">{description}</span>
				{/if}
			</span>
		</button>
	{#if actions}
		<div class="shrink-0">
			{@render actions()}
		</div>
	{/if}
	</div>

	{#if expanded}
		<div class="border-t border-[#252522] p-4">
			{@render children()}
		</div>
	{/if}
</section>
