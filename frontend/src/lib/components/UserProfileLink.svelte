<script lang="ts">
	import type { UserProfile } from '$lib/api';
	import { userDisplayName, userProfileHref } from '$lib/identity';

	let {
		user,
		profile = null,
		className = ''
	}: {
		user: string | null | undefined;
		profile?: UserProfile | null;
		className?: string;
	} = $props();

	const label = $derived(userDisplayName(user, profile));
	const href = $derived(userProfileHref(user, profile));
</script>

{#if href}
	<a href={href} class={`${className} hover:text-[#d9a66c]`}>{label}</a>
{:else}
	<span class={className}>{label}</span>
{/if}
