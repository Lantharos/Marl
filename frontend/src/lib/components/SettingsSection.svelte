<script lang="ts">
	import ChevronDown from 'lucide-svelte/icons/chevron-down';

	let {
		title,
		description: _description,
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

	let expandedOverride = $state<boolean | null>(null);
	let expanded = $derived(expandedOverride ?? open);
</script>

<section class="border border-[#2a2a28] bg-[#141412]">
	<div class="flex min-h-12 items-center justify-between gap-3 border-b px-4 transition-[background-color] hover:bg-[#181816] {expanded ? 'border-[#252522]' : 'border-transparent'}">
		<button class="flex min-w-0 flex-1 items-center gap-2 py-3 text-left outline-none focus-visible:outline-none" type="button" onclick={() => (expandedOverride = !expanded)}>
			<ChevronDown class="h-4 w-4 shrink-0 text-[#6f6b5f] transition-transform {expanded ? '' : '-rotate-90'}" />
			<span class="min-w-0 truncate text-sm font-medium text-[#eae9e4]">{title}</span>
		</button>
	{#if actions}
		<div class="shrink-0">
			{@render actions()}
		</div>
	{/if}
	</div>

	{#if expanded}
		<div class="p-4">
			{@render children()}
		</div>
	{/if}
</section>
