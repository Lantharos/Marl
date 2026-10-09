<script lang="ts">
  import type { Snippet } from 'svelte';
  import { page } from '$app/state';
  import GitBranch from '@lucide/svelte/icons/git-branch';
  import KeyRound from '@lucide/svelte/icons/key-round';
  import Settings from '@lucide/svelte/icons/settings';
  import Users from '@lucide/svelte/icons/users';
  import Webhook from '@lucide/svelte/icons/webhook';
  import type { LucideIcon } from '@lucide/svelte';
  import SettingsLayout from '../SettingsLayout.svelte';
  import SettingsNav from '../SettingsNav.svelte';

  let { owner, repository, children }: { owner: string; repository: string; children: Snippet } = $props();
  const settings = $derived(`/${owner}/${repository}/settings`);
  const path = $derived(page.url.pathname);
  const link = (href: string, label: string, icon: LucideIcon) => ({
    href,
    label,
    icon,
    active: href === settings ? path === settings : path.startsWith(href)
  });
  const groups = $derived([
    [
      link(settings, 'General', Settings),
      link(`${settings}/branches`, 'Branches', GitBranch),
      link(`${settings}/access`, 'Access and security', Users)
    ],
    [link(`${settings}/secrets`, 'CI secrets', KeyRound), link(`${settings}/webhooks`, 'Webhooks', Webhook)]
  ]);
</script>

{#snippet sidebar()}<SettingsNav label="Repository settings" {groups} />{/snippet}
<SettingsLayout {sidebar} content={children} />
