<script lang="ts">
  import ArrowLeft from 'lucide-svelte/icons/arrow-left';
  import Building2 from 'lucide-svelte/icons/building-2';
  import KeyRound from 'lucide-svelte/icons/key-round';
  import Users from 'lucide-svelte/icons/users';
  import ExternalLink from 'lucide-svelte/icons/external-link';
  import OrganizationAvatar from '../OrganizationAvatar.svelte';
  import SettingsLayout from './SettingsLayout.svelte';

  let { name, slug, avatarUrl = null, active, showSecrets = true, children } = $props<{
    name: string;
    slug: string;
    avatarUrl?: string | null;
    active: 'profile' | 'access' | 'secrets';
    showSecrets?: boolean;
    children: import('svelte').Snippet;
  }>();
</script>

{#snippet sidebar()}
    <a class="back" href="/organizations"><ArrowLeft size={15} />Back to organizations</a>
    <a class="identity" href="/{slug}"><OrganizationAvatar name={name} src={avatarUrl} size={32} /><span><h1>{name}</h1><small>{slug}</small></span><ExternalLink size={12} /></a>
    <nav aria-label="Organization settings">
      <a class:active={active === 'profile'} href="/organizations/{slug}/settings/profile"><Building2 size={15} />Profile</a>
      <a class:active={active === 'access'} href="/organizations/{slug}/settings/access"><Users size={15} />People and teams</a>
      {#if showSecrets}<a class:active={active === 'secrets'} href="/organizations/{slug}/settings/secrets"><KeyRound size={15} />CI secrets</a>{/if}
    </nav>
{/snippet}
<SettingsLayout {sidebar} content={children} />

<style>
  .back{display:inline-flex;min-height:34px;align-items:center;gap:7px;margin:0 0 22px;padding:0 8px;border-radius:6px;color:var(--text-muted);font-size:12px;text-decoration:none}.back:hover{background:var(--surface-muted);color:var(--text-strong)}.identity{display:grid;grid-template-columns:32px minmax(0,1fr) 12px;align-items:center;gap:9px;margin:0 0 14px;padding:7px 8px;border-radius:6px;color:var(--text-faint);text-decoration:none}.identity:hover{background:var(--surface-muted);color:var(--text-muted)}.identity h1{margin:0;color:var(--text-strong);font-size:13px;font-weight:650}.identity small{display:block;margin-top:2px;color:var(--text-faint);font-size:11px}nav{display:grid;gap:2px}nav a{display:flex;min-height:40px;align-items:center;gap:9px;padding:0 10px;border-radius:6px;color:var(--text-muted);font-size:12px;text-decoration:none}nav a:hover{background:var(--surface-hover);color:var(--text-strong)}nav a.active{background:var(--surface-muted);color:var(--text-strong)}@media(max-width:800px){nav{display:flex;flex-wrap:wrap;gap:4px}nav a{padding:0 12px;min-height:38px;font-size:12px}}
</style>
