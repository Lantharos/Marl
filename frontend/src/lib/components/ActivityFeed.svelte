<script lang="ts">
	import type { Activity } from '$lib/api';

	let { activities }: { activities: Activity[] } = $props();

	function icon(kind: Activity['kind']) {
		switch (kind) {
			case 'save': return 'S';
			case 'ship': return 'SHIP';
			case 'cram': return 'C';
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
			case 'cram': return 'bg-[#3a3a36] text-[#d9a66c]';
			case 'issue': return 'bg-[#3a3a36] text-[#d9a66c]';
			case 'ready': return 'bg-[#3a3a36] text-[#6ba4c7]';
			case 'merge': return 'bg-[#3a3a36] text-[#d96c5a]';
			case 'star': return 'bg-[#3a3a36] text-[#d9a66c]';
			default: return 'bg-[#2a2a28] text-[#a09d94]';
		}
	}

	function initials(activity: Activity) {
		const name = activity.actor_profile?.display_name || activity.actor;
		const parts = name.trim().split(/\s+/).filter(Boolean);
		if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
		return (parts[0] ?? name).slice(0, 2).toUpperCase();
	}

	function displayName(activity: Activity) {
		return activity.actor_profile?.display_name || activity.actor_profile?.handle || activity.actor;
	}
</script>

<div class="grid gap-0">
	{#each activities as activity}
		<div class="flex items-start gap-3 border-b border-[#1e1e1c] py-3 last:border-0">
			<div class="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#2a2a28] text-[10px] font-medium text-[#eae9e4]">
				{#if activity.actor_profile?.avatar_url}
					<img src={activity.actor_profile.avatar_url} alt="" class="h-full w-full object-cover" />
				{:else}
					{initials(activity)}
				{/if}
			</div>
			<div class="min-w-0 flex-1">
				<p class="text-sm text-[#eae9e4]">
					<span class="font-medium">{displayName(activity)}</span>
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
