<script lang="ts">
  import { page } from '$app/stores';
  import GitBranch from 'lucide-svelte/icons/git-branch';
  import KeyRound from 'lucide-svelte/icons/key-round';
  import Settings from 'lucide-svelte/icons/settings';
  import Users from 'lucide-svelte/icons/users';
  import SettingsLayout from './SettingsLayout.svelte';

  let { owner, repository, children } = $props<{ owner: string; repository: string; children: import('svelte').Snippet }>();
  const base = $derived(`/${owner}/${repository}`);
  const settings = $derived(`${base}/settings`);
  const path = $derived($page.url.pathname);
</script>

{#snippet sidebar()}
  <h1>{owner}/{repository}</h1>
  <nav aria-label="Repository settings">
    <a class:active={path === settings} href={settings}><Settings size={15} />General</a>
    <a class:active={path.startsWith(`${settings}/branches`)} href="{settings}/branches"><GitBranch size={15} />Branches</a>
    <a class:active={path.startsWith(`${settings}/access`)} href="{settings}/access"><Users size={15} />Access</a>
    <a class:active={path.startsWith(`${settings}/secrets`)} href="{settings}/secrets"><KeyRound size={15} />CI secrets</a>
  </nav>
{/snippet}
<SettingsLayout {sidebar} content={children} />

<style>
  h1{overflow:hidden;margin:0 0 12px;padding:0 10px;color:var(--text-muted);font-size:13px;font-weight:650;text-overflow:ellipsis;white-space:nowrap}nav{display:grid;gap:2px}nav a{display:flex;min-height:38px;align-items:center;gap:9px;padding:0 10px;border-radius:6px;color:var(--text-muted);font-size:12px;text-decoration:none}nav a:hover,nav a.active{background:var(--brand-soft);color:var(--text-strong)}@media(max-width:720px){nav{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>
