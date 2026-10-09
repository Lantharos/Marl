<script lang="ts">
  import { goto, refreshAll } from '$app/navigation';
  import { onMount } from 'svelte';
  import Building2 from '@lucide/svelte/icons/building-complex';
  import LogOut from '@lucide/svelte/icons/log-out';
  import Monitor from '@lucide/svelte/icons/monitor';
  import Moon from '@lucide/svelte/icons/moon';
  import Settings from '@lucide/svelte/icons/settings';
  import Sun from '@lucide/svelte/icons/sun';
  import UserRound from '@lucide/svelte/icons/user-round';
  import { clearShellCache } from '#lib/shell-cache.js';
  import { setThemePreference, themePreference, type ThemePreference } from '#lib/theme.js';
  import SegmentedControl from '../controls/SegmentedControl.svelte';
  import UserAvatar from '../identity/UserAvatar.svelte';
  import Menu from '../overlays/menu/Menu.svelte';
  import MenuItem from '../overlays/menu/MenuItem.svelte';
  import type { ShellUser } from '#lib/shell-cache.js';

  let { user }: { user: ShellUser } = $props();
  let theme = $state<ThemePreference>('system');
  const themes = [
    { value: 'system', label: 'System', icon: Monitor },
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon }
  ] as const;

  onMount(() => {
    theme = themePreference();
  });

  async function signOut() {
    const { authClient } = await import('#lib/auth-client.js');
    await authClient.signOut();
    clearShellCache(true);
    await refreshAll();
    await goto('/sign-in');
  }
</script>

<Menu label="Account" class="w-60">
  {#snippet trigger(menu)}
    <button {...menu} class="grid size-8 place-items-center overflow-hidden rounded-full" aria-label="Account menu"
      ><UserAvatar name={user.displayName || user.handle} src={user.avatarUrl} size={28} /></button
    >
  {/snippet}
  <div class="mb-1 grid grid-cols-[30px_minmax(0,1fr)] items-center gap-2.5 rounded-lg bg-surface p-2.5">
    <UserAvatar name={user.displayName || user.handle} src={user.avatarUrl} size={30} />
    <span class="min-w-0">
      <span class="block truncate text-sm font-semibold text-ink-strong">{user.displayName}</span>
      <span class="block truncate text-xs text-ink-muted">@{user.handle}</span>
    </span>
  </div>
  <MenuItem href="/{user.handle}" icon={UserRound}>Your profile</MenuItem>
  <MenuItem href="/settings/account/profile" icon={Settings}>Settings</MenuItem>
  <MenuItem href="/organizations" icon={Building2}>Organizations</MenuItem>
  <div class="my-1 px-2.5">
    <span class="text-xs text-ink-muted">Appearance</span>
    <SegmentedControl
      label="Appearance"
      options={themes}
      bind:value={theme}
      onchange={setThemePreference}
      class="mt-1.5"
    />
  </div>
  <MenuItem icon={LogOut} onselect={signOut}>Sign out</MenuItem>
</Menu>
