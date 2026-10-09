<script lang="ts">
  import type { Snippet } from 'svelte';
  import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
  import Bot from '@lucide/svelte/icons/bot';
  import Building2 from '@lucide/svelte/icons/building-complex';
  import KeyRound from '@lucide/svelte/icons/key-round';
  import Users from '@lucide/svelte/icons/users';
  import Webhook from '@lucide/svelte/icons/webhook';
  import OrganizationAvatar from '../../identity/OrganizationAvatar.svelte';
  import Page from '../../page/Page.svelte';
  import SettingsLayout from '../SettingsLayout.svelte';
  import SettingsNav from '../SettingsNav.svelte';

  let {
    name,
    slug,
    avatarUrl = null,
    active,
    showSecrets = true,
    children
  }: {
    name: string;
    slug: string;
    avatarUrl?: string | null;
    active: 'profile' | 'access' | 'agents' | 'secrets' | 'webhooks';
    showSecrets?: boolean;
    children: Snippet;
  } = $props();
  const base = $derived(`/organizations/${slug}/settings`);
  const items = $derived([
    { href: `${base}/profile`, label: 'Profile', icon: Building2, active: active === 'profile' },
    { href: `${base}/access`, label: 'People and teams', icon: Users, active: active === 'access' },
    { href: `${base}/agents`, label: 'Agents', icon: Bot, active: active === 'agents' },
    ...(showSecrets
      ? [{ href: `${base}/secrets`, label: 'CI secrets', icon: KeyRound, active: active === 'secrets' }]
      : []),
    { href: `${base}/webhooks`, label: 'Webhooks', icon: Webhook, active: active === 'webhooks' }
  ]);
</script>

{#snippet sidebar()}
  <a
    href="/{slug}"
    class="group mb-4 grid grid-cols-[32px_minmax(0,1fr)_14px] items-center gap-2.5 rounded-lg p-2 transition-colors hover:bg-surface-hover"
  >
    <OrganizationAvatar {name} src={avatarUrl} size={32} />
    <span class="min-w-0">
      <span class="block truncate text-sm font-semibold text-ink-strong">{name}</span>
      <span class="block truncate text-xs text-ink-muted">{slug}</span>
    </span>
    <ArrowUpRight size={14} class="text-ink-faint group-hover:text-ink-muted" />
  </a>
  <SettingsNav label="Organization settings" {items} />
{/snippet}
<Page><SettingsLayout {sidebar} content={children} /></Page>
