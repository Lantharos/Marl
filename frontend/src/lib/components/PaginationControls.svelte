<script lang="ts">
	import type { Paginated } from '$lib/api';

	let {
		data,
		onPage
	}: {
		data: Paginated<unknown> | null;
		onPage: (page: number) => void;
	} = $props();
</script>

{#if data && data.total_pages > 1}
	<div class="mt-4 flex items-center justify-between text-xs text-[#6f6b5f]">
		<span>Page {data.page} of {data.total_pages} - {data.total} total</span>
		<div class="flex gap-2">
			<button
				class="rounded bg-[#141412] px-3 py-1.5 text-[#eae9e4] hover:bg-[#1a1a18] disabled:text-[#4b4841]"
				disabled={!data.prev}
				onclick={() => data.prev && onPage(data.prev)}
			>
				Previous
			</button>
			<button
				class="rounded bg-[#141412] px-3 py-1.5 text-[#eae9e4] hover:bg-[#1a1a18] disabled:text-[#4b4841]"
				disabled={!data.next}
				onclick={() => data.next && onPage(data.next)}
			>
				Next
			</button>
		</div>
	</div>
{/if}
