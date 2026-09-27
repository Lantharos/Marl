<script lang="ts">
  import UserAvatar from './UserAvatar.svelte';

  let {
    handle = null,
    displayName,
    avatarUrl = null,
    size = 24,
    avatar = true,
    name = true,
    showHandle = false,
    detail = null
  } = $props<{
    handle?: string | null;
    displayName: string;
    avatarUrl?: string | null;
    size?: number;
    avatar?: boolean;
    name?: boolean;
    showHandle?: boolean;
    detail?: string | null;
  }>();
</script>

{#snippet identity()}
  {#if avatar}<UserAvatar name={displayName} src={avatarUrl} {size} />{/if}
  {#if name}<span class="identity-label"><strong>{displayName}</strong>{#if detail}<small>{detail}</small>{:else if showHandle && handle}<small>@{handle}</small>{/if}</span>{/if}
{/snippet}

{#if handle}
  <a class="user-profile-link" class:avatar-only={!name} href="/{handle}" aria-label={!name ? displayName : undefined}>{@render identity()}</a>
{:else}
  <span class="user-profile-link" class:avatar-only={!name}>{@render identity()}</span>
{/if}

<style>
  .user-profile-link{display:inline-flex;min-width:0;align-items:center;gap:7px;color:var(--text-strong);text-decoration:none}.identity-label{display:grid;min-width:0;gap:2px}.user-profile-link strong{overflow:hidden;font:inherit;font-weight:630;text-overflow:ellipsis;white-space:nowrap}.user-profile-link small{overflow:hidden;color:var(--text-faint);font:inherit;font-size:.85em;font-weight:400;text-overflow:ellipsis;white-space:nowrap}.user-profile-link:is(a):hover strong{color:var(--brand)}.user-profile-link.avatar-only{display:inline-grid}
</style>
