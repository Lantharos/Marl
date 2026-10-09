<script lang="ts">
  import type { Snippet } from 'svelte';
  import { page } from '$app/state';
  import Bot from '@lucide/svelte/icons/bot';
  import DatabaseBackup from '@lucide/svelte/icons/database-backup';
  import KeyRound from '@lucide/svelte/icons/key-round';
  import Bell from '@lucide/svelte/icons/bell';
  import Mail from '@lucide/svelte/icons/mail';
  import MessageSquareText from '@lucide/svelte/icons/message-square-text';
  import MonitorSmartphone from '@lucide/svelte/icons/monitor-smartphone';
  import TerminalSquare from '@lucide/svelte/icons/square-terminal';
  import ShieldCheck from '@lucide/svelte/icons/shield-check';
  import UserRound from '@lucide/svelte/icons/user-round';
  import type { LucideIcon } from '@lucide/svelte';
  import Page from '../../page/Page.svelte';
  import SettingsLayout from '../SettingsLayout.svelte';
  import SettingsNav from '../SettingsNav.svelte';

  let { children }: { children: Snippet } = $props();
  const path = $derived(page.url.pathname);
  const link = (href: string, label: string, icon: LucideIcon, active = path === href) => ({
    href,
    label,
    icon,
    active
  });
  const groups = $derived([
    [
      link('/settings/account/profile', 'Profile', UserRound),
      link('/settings/account/emails', 'Emails', Mail, path.startsWith('/settings/account/emails')),
      link('/settings/account/notifications', 'Notifications', Bell),
      link('/settings/account/replies', 'Saved replies', MessageSquareText)
    ],
    [
      link('/settings/account', 'Sign-in and security', ShieldCheck),
      link('/settings/account/sessions', 'Sessions', MonitorSmartphone),
      link('/settings/account/ssh-keys', 'SSH keys', TerminalSquare)
    ],
    [link('/settings/account/tokens', 'Developer access', KeyRound), link('/settings/account/agents', 'Agents', Bot)],
    [link('/settings/account/data', 'Data and deletion', DatabaseBackup)]
  ]);
</script>

{#snippet sidebar()}
  <p class="mb-3 hidden px-3 text-sm font-semibold text-ink-muted md:block">Account settings</p>
  <SettingsNav label="Account settings" {groups} />
{/snippet}
<Page><SettingsLayout {sidebar} content={children} /></Page>
