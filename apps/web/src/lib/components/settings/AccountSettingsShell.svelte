<script lang="ts">
  import type { Snippet } from 'svelte';
  import { page } from '$app/state';
  import DatabaseBackup from '@lucide/svelte/icons/database-backup';
  import KeyRound from '@lucide/svelte/icons/key-round';
  import Bell from '@lucide/svelte/icons/bell';
  import Mail from '@lucide/svelte/icons/mail';
  import MonitorSmartphone from '@lucide/svelte/icons/monitor-smartphone';
  import TerminalSquare from '@lucide/svelte/icons/square-terminal';
  import ShieldCheck from '@lucide/svelte/icons/shield-check';
  import UserRound from '@lucide/svelte/icons/user-round';
  import SettingsLayout from './SettingsLayout.svelte';
  import SettingsNav from './SettingsNav.svelte';

  let { children }: { children: Snippet } = $props();
  const path = $derived(page.url.pathname);
  const items = $derived([
    {
      href: '/settings/account/profile',
      label: 'Profile',
      icon: UserRound,
      active: path === '/settings/account/profile'
    },
    {
      href: '/settings/account/emails',
      label: 'Emails',
      icon: Mail,
      active: path.startsWith('/settings/account/emails')
    },
    {
      href: '/settings/account/notifications',
      label: 'Notifications',
      icon: Bell,
      active: path === '/settings/account/notifications'
    },
    {
      href: '/settings/account',
      label: 'Sign-in and security',
      icon: ShieldCheck,
      active: path === '/settings/account'
    },
    {
      href: '/settings/account/sessions',
      label: 'Sessions',
      icon: MonitorSmartphone,
      active: path === '/settings/account/sessions'
    },
    {
      href: '/settings/account/tokens',
      label: 'Developer access',
      icon: KeyRound,
      active: path === '/settings/account/tokens'
    },
    {
      href: '/settings/account/ssh-keys',
      label: 'SSH keys',
      icon: TerminalSquare,
      active: path === '/settings/account/ssh-keys'
    },
    {
      href: '/settings/account/data',
      label: 'Data and deletion',
      icon: DatabaseBackup,
      active: path === '/settings/account/data'
    }
  ]);
</script>

{#snippet sidebar()}
  <p class="mb-3 hidden px-3 text-sm font-semibold text-ink-muted md:block">Account settings</p>
  <SettingsNav label="Account settings" {items} />
{/snippet}
<SettingsLayout {sidebar} content={children} />
