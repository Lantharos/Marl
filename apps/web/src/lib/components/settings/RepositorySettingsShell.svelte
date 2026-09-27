<script lang="ts">
  import type { Snippet } from 'svelte';
  import { page } from '$app/state';
  import GitBranch from '@lucide/svelte/icons/git-branch';
  import KeyRound from '@lucide/svelte/icons/key-round';
  import Settings from '@lucide/svelte/icons/settings';
  import Users from '@lucide/svelte/icons/users';
  import SettingsLayout from './SettingsLayout.svelte';
  import SettingsNav from './SettingsNav.svelte';

  let { owner, repository, children }: { owner: string; repository: string; children: Snippet } = $props();
  const settings = $derived(`/${owner}/${repository}/settings`);
  const path = $derived(page.url.pathname);
  const items = $derived([
    { href: settings, label: 'General', icon: Settings, active: path === settings },
    {
      href: `${settings}/branches`,
      label: 'Branches',
      icon: GitBranch,
      active: path.startsWith(`${settings}/branches`)
    },
    {
      href: `${settings}/access`,
      label: 'Access and security',
      icon: Users,
      active: path.startsWith(`${settings}/access`)
    },
    { href: `${settings}/secrets`, label: 'CI secrets', icon: KeyRound, active: path.startsWith(`${settings}/secrets`) }
  ]);
</script>

{#snippet sidebar()}<SettingsNav label="Repository settings" {items} />{/snippet}
<SettingsLayout {sidebar} content={children} />
