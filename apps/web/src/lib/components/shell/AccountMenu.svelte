<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { onMount } from 'svelte';
  import Building2 from '@lucide/svelte/icons/building-complex';
  import LogOut from '@lucide/svelte/icons/log-out';
  import Monitor from '@lucide/svelte/icons/monitor';
  import Moon from '@lucide/svelte/icons/moon';
  import Settings from '@lucide/svelte/icons/settings';
  import Sun from '@lucide/svelte/icons/sun';
  import UserRound from '@lucide/svelte/icons/user-round';
  import { dismissable } from '$lib/actions/dismissable';
  import { clearShellCache } from '$lib/shell-cache';
  import { setThemePreference, themePreference, type ThemePreference } from '$lib/theme';
  import { popoverMotion } from '$lib/ui/popover';
  import UserAvatar from '../identity/UserAvatar.svelte';
  import type { ShellUser } from '$lib/shell-cache';
  import MenuLink from './MenuLink.svelte';

  let { user, open = $bindable(false) }: { user: ShellUser; open?: boolean } = $props();
  let theme = $state<ThemePreference>('system');
  const themes = [
    { value: 'system', label: 'System', icon: Monitor },
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon }
  ] as const;

  onMount(() => {
    theme = themePreference();
  });

  function chooseTheme(value: ThemePreference) {
    theme = value;
    setThemePreference(value);
  }

  async function signOut() {
    const { authClient } = await import('$lib/auth-client');
    await authClient.signOut();
    clearShellCache(true);
    await invalidateAll();
    await goto('/sign-in');
  }
</script>

<div class="relative" use:dismissable={() => (open = false)}>
  <button
    class="grid size-8 place-items-center overflow-hidden rounded-full"
    aria-label="Account menu"
    aria-expanded={open}
    onclick={() => (open = !open)}
    ><UserAvatar name={user.displayName || user.handle} src={user.avatarUrl} size={28} /></button
  >
  {#if open}
    <div class="absolute top-10 right-0 z-80 w-60 origin-top-right popover p-1.5" transition:popoverMotion>
      <div class="mb-1.5 grid grid-cols-[30px_minmax(0,1fr)] items-center gap-2.5 rounded-lg bg-surface p-2.5">
        <UserAvatar name={user.displayName || user.handle} src={user.avatarUrl} size={30} />
        <span class="min-w-0">
          <span class="block truncate text-sm font-semibold text-ink-strong">{user.displayName}</span>
          <span class="block truncate text-xs text-ink-muted">@{user.handle}</span>
        </span>
      </div>
      <MenuLink href="/{user.handle}" icon={UserRound} onclick={() => (open = false)}>Your profile</MenuLink>
      <MenuLink href="/settings/account/profile" icon={Settings} onclick={() => (open = false)}>Settings</MenuLink>
      <MenuLink href="/organizations" icon={Building2} onclick={() => (open = false)}>Organizations</MenuLink>
      <div class="my-1.5 px-2.5">
        <span class="text-xs text-ink-muted">Appearance</span>
        <div
          class="mt-1.5 grid grid-cols-3 gap-0.5 rounded-lg bg-surface-muted p-0.5"
          role="radiogroup"
          aria-label="Appearance"
        >
          {#each themes as option (option.value)}
            <button
              type="button"
              role="radio"
              aria-checked={theme === option.value}
              class={[
                'flex h-8 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors',
                theme === option.value
                  ? 'bg-surface-raised text-ink-strong shadow-subtle'
                  : 'text-ink-muted hover:text-ink-strong'
              ]}
              onclick={() => chooseTheme(option.value)}><option.icon size={13} />{option.label}</button
            >
          {/each}
        </div>
      </div>
      <MenuLink icon={LogOut} onclick={signOut}>Sign out</MenuLink>
    </div>
  {/if}
</div>
