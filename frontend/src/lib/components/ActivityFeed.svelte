<script lang="ts">
	import type { Activity } from '$lib/api';

	let { activities }: { activities: Activity[] } = $props();

	function icon(kind: Activity['kind']) {
		switch (kind) {
			case 'save': return 'S';
			case 'ship': return 'SHIP';
			case 'issue': return 'I';
			case 'ready': return 'R';
			case 'merge': return 'M';
			case 'star': return '★';
			default: return '?';
		}
	}

	function color(kind: Activity['kind']) {
		switch (kind) {
			case 'save': return 'bg-[#2a2a28] text-[#a09d94]';
			case 'ship': return 'bg-[#3a3a36] text-[#7cb97c]';
			case 'issue': return 'bg-[#3a3a36] text-[#d9a66c]';
			case 'ready': return 'bg-[#3a3a36] text-[#6ba4c7]';
			case 'merge': return 'bg-[#3a3a36] text-[#d96c5a]';
			case 'star': return 'bg-[#3a3a36] text-[#d9a66c]';
			default: return 'bg-[#2a2a28] text-[#a09d94]';
		}
	}
</script>

<div class="grid gap-0">
	{#each activities as activity}
		<div class="flex items-start gap-3 border-b border-[#1e1e1c] py-3 last:border-0">
			<div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold {color(activity.kind)}">
				{icon(activity.kind)}
			</div>
			<div class="min-w-0 flex-1">
				<p class="text-sm text-[#eae9e4]">
					<span class="font-medium">{activity.actor}</span>
					{activity.message}
				</p>
				<div class="mt-0.5 flex items-center gap-2 text-xs text-[#6f6b5f]">
					{#if activity.workspace}
						<span class="rounded bg-[#1e1e1c] px-1.5 py-0.5">{activity.workspace}</span>
					{/if}
					<span>{new Date(activity.timestamp).toLocaleString()}</span>
				</div>
			</div>
		</div>
	{:else}
		<p class="py-6 text-center text-sm text-[#6f6b5f]">No recent activity.</p>
	{/each}
</div>
