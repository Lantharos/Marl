<script lang="ts">
	import type { CommandGroup } from '$lib/docs/commands';

	let { groups }: { groups: CommandGroup[] } = $props();
</script>

{#each groups as group (group.title)}
	<section>
		<h2 class="text-lg font-semibold text-[#eae9e4]">{group.title}</h2>
		<p class="mt-2 max-w-3xl text-sm leading-6 text-[#8c887e]">{group.intro}</p>
		<div class="mt-4 overflow-hidden rounded border border-[#2a2a28]">
			{#each group.rows as row (row.command)}
				<div class="grid gap-2 border-b border-[#252522] px-4 py-3 last:border-b-0 md:grid-cols-[280px_1fr]">
					<code class="text-sm text-[#d9a66c]">{row.command}</code>
					<p class="text-sm leading-6 text-[#a09d94]">{row.description}</p>
				</div>
			{/each}
		</div>
	</section>
{/each}
