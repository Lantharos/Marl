<script lang="ts">
  import { page } from '$app/stores';
  import Building2 from 'lucide-svelte/icons/building-2';
  import KeyRound from 'lucide-svelte/icons/key-round';
  import MonitorSmartphone from 'lucide-svelte/icons/monitor-smartphone';
  import ShieldCheck from 'lucide-svelte/icons/shield-check';
  import UserRound from 'lucide-svelte/icons/user-round';

  let { children } = $props<{ children: import('svelte').Snippet }>();
  const path = $derived($page.url.pathname);
</script>

<div class="settings-layout">
  <aside>
    <h1>Settings</h1>
    <nav aria-label="Settings">
      <a class:active={path === '/settings/account/profile'} href="/settings/account/profile"><UserRound size={15} />Profile</a>
      <a class:active={path === '/settings/account'} href="/settings/account"><ShieldCheck size={15} />Sign-in and security</a>
      <a class:active={path === '/settings/account/sessions'} href="/settings/account/sessions"><MonitorSmartphone size={15} />Sessions</a>
      <a class:active={path === '/settings/account/tokens'} href="/settings/account/tokens"><KeyRound size={15} />Developer access</a>
      <a class:active={path === '/organizations'} href="/organizations"><Building2 size={15} />Organizations</a>
    </nav>
  </aside>
  <div class="settings-panel">{@render children()}</div>
</div>

<style>
  .settings-layout{display:grid;width:min(1080px,calc(100% - 40px));grid-template-columns:215px minmax(0,760px);gap:42px;margin:0 auto;padding:42px 0 80px}.settings-layout aside{position:sticky;top:76px;align-self:start}.settings-layout aside h1{margin:0 0 12px;padding:0 9px;color:var(--text-faint);font-size:10px}.settings-layout nav{display:grid;gap:2px}.settings-layout nav a{display:flex;min-height:36px;align-items:center;gap:9px;padding:0 10px;border-radius:6px;color:var(--text-muted);font-size:10px;text-decoration:none}.settings-layout nav a:hover,.settings-layout nav a.active{background:var(--brand-soft);color:var(--text-strong)}.settings-panel{min-width:0}@media(max-width:720px){.settings-layout{grid-template-columns:1fr;gap:28px}.settings-layout aside{position:static}.settings-layout nav{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>
