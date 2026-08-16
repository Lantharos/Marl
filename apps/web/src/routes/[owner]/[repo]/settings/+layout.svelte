<script lang="ts">
  import { page } from '$app/stores';
  import GitBranch from 'lucide-svelte/icons/git-branch';
  import Settings from 'lucide-svelte/icons/settings';

  let { children } = $props<{ children: import('svelte').Snippet }>();
  const base = $derived(`/${$page.params.owner}/${$page.params.repo}/settings`);
</script>

<div class="settings-shell">
  <aside>
    <h1>Repository settings</h1>
    <nav aria-label="Settings">
      <a class:active={$page.url.pathname === base} href={base}><Settings size={14} />General</a>
      <a class:active={$page.url.pathname.startsWith(`${base}/branches`)} href="{base}/branches"><GitBranch size={14} />Branches</a>
    </nav>
  </aside>
  <main>{@render children()}</main>
</div>

<style>
  .settings-shell{display:grid;grid-template-columns:190px minmax(0,760px);gap:34px;align-items:start}.settings-shell aside{position:sticky;top:24px}.settings-shell h1{margin:0 0 12px;padding:0 8px;color:var(--text-faint);font-size:10px;font-weight:620}.settings-shell nav{display:grid;gap:2px}.settings-shell nav a{display:flex;height:34px;align-items:center;gap:8px;padding:0 9px;border-radius:6px;color:var(--text-muted);font-size:10px;font-weight:580;text-decoration:none}.settings-shell nav a:hover{background:var(--surface-muted);color:var(--text-strong)}.settings-shell nav a.active{background:var(--brand-soft);color:var(--text-strong)}main{min-width:0}@media(max-width:720px){.settings-shell{grid-template-columns:1fr;gap:20px}.settings-shell aside{position:static}.settings-shell aside nav{display:flex;overflow:auto}.settings-shell aside nav a{flex:0 0 auto}}
</style>
