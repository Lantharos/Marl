<script lang="ts">
	import type { UserProfile } from '$lib/api';
	import { userInitials, userDisplayName, userProfileHref } from '$lib/identity';

	type AvatarSize = 'xs' | 'sm' | 'md';

	let {
		user,
		profile = null,
		size = 'md',
		ring = false,
		muted = false,
		linked = true,
		className = ''
	}: {
		user: string | null | undefined;
		profile?: UserProfile | null;
		size?: AvatarSize;
		ring?: boolean;
		muted?: boolean;
		linked?: boolean;
		className?: string;
	} = $props();

	const sizeClass = $derived(size === 'xs' ? 'h-5 w-5 text-[8px]' : size === 'sm' ? 'h-6 w-6 text-[9px]' : 'h-7 w-7 text-[10px]');
	const surfaceClass = $derived(muted ? 'bg-[#1f1f1c]' : 'bg-[#2a2a28]');
	const ringClass = $derived(ring ? 'ring-4 ring-[#0f0f0d]' : '');
	const label = $derived(userDisplayName(user, profile));
	const href = $derived(linked ? userProfileHref(user, profile) : null);
</script>

{#if href}
	<a class={`flex shrink-0 items-center justify-center overflow-hidden rounded-full ${surfaceClass} ${sizeClass} ${ringClass} font-medium text-[#eae9e4] hover:opacity-80 ${className}`} href={href} aria-label={label} title={label}>
		{#if profile?.avatar_url}
			<img src={profile.avatar_url} alt="" class="h-full w-full object-cover" />
		{:else}
			{userInitials(user, profile)}
		{/if}
	</a>
{:else}
	<div class={`flex shrink-0 items-center justify-center overflow-hidden rounded-full ${surfaceClass} ${sizeClass} ${ringClass} font-medium text-[#eae9e4] ${className}`} aria-label={label} title={label}>
		{#if profile?.avatar_url}
			<img src={profile.avatar_url} alt="" class="h-full w-full object-cover" />
		{:else}
			{userInitials(user, profile)}
		{/if}
	</div>
{/if}
