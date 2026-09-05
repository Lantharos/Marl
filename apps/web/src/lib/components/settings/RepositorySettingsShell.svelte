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
  <nav aria-label="Repository settings">
    <a class:active={path === settings} href={settings}><Settings size={15} />General</a>
    <a class:active={path.startsWith(`${settings}/branches`)} href="{settings}/branches"><GitBranch size={15} />Branches</a>
    <a class:active={path.startsWith(`${settings}/access`)} href="{settings}/access"><Users size={15} />Access</a>
    <a class:active={path.startsWith(`${settings}/secrets`)} href="{settings}/secrets"><KeyRound size={15} />CI secrets</a>
  </nav>
{/snippet}
<SettingsLayout {sidebar} content={children} />

<style>
  nav{display:grid;gap:2px}nav a{display:flex;min-height:40px;align-items:center;gap:9px;padding:0 10px;border-radius:6px;color:var(--text-muted);font-size:12px;text-decoration:none}nav a:hover{background:var(--surface-hover);color:var(--text-strong)}nav a.active{background:var(--surface-muted);color:var(--text-strong)}@media(max-width:800px){nav{display:flex;flex-wrap:wrap;gap:4px}nav a{padding:0 12px;min-height:38px;font-size:12px}}
</style>
