<script lang="ts">
  import { page } from '$app/stores';
  import GitBranch from 'lucide-svelte/icons/git-branch';
  import Settings from 'lucide-svelte/icons/settings';
  import Users from 'lucide-svelte/icons/users';
  import KeyRound from 'lucide-svelte/icons/key-round';

  let { children } = $props<{ children: import('svelte').Snippet }>();
  const base = $derived(`/${$page.params.owner}/${$page.params.repo}/settings`);
</script>

<div class="settings-shell">
  <aside>
    <h1>Repository settings</h1>
    <nav aria-label="Settings">
      <a class:active={$page.url.pathname === base} href={base}><Settings size={14} />General</a>
      <a class:active={$page.url.pathname.startsWith(`${base}/branches`)} href="{base}/branches"><GitBranch size={14} />Branches</a>
      <a class:active={$page.url.pathname.startsWith(`${base}/access`)} href="{base}/access"><Users size={14} />Access</a>
      <a class:active={$page.url.pathname.startsWith(`${base}/secrets`)} href="{base}/secrets"><KeyRound size={14} />Secrets</a>
    </nav>
  </aside>
  <main>{@render children()}</main>
</div>

<style>
  .settings-shell{display:grid;grid-template-columns:205px minmax(0,820px);gap:38px;align-items:start}.settings-shell aside{position:sticky;top:72px;max-height:calc(100vh - 88px);overflow:auto}.settings-shell h1{margin:0 0 12px;padding:0 8px;color:var(--text-faint);font-size:10px;font-weight:620}.settings-shell nav{display:grid;gap:2px}.settings-shell nav a{display:flex;height:36px;align-items:center;gap:8px;padding:0 10px;border-radius:6px;color:var(--text-muted);font-size:10px;font-weight:580;text-decoration:none}.settings-shell nav a:hover{background:var(--surface-muted);color:var(--text-strong)}.settings-shell nav a.active{background:var(--brand-soft);color:var(--text-strong)}main{min-width:0}@media(max-width:720px){.settings-shell{grid-template-columns:1fr;gap:20px}.settings-shell aside{position:static;max-height:none}.settings-shell aside nav{display:flex;overflow:auto}.settings-shell aside nav a{flex:0 0 auto}}
</style>
