<script lang="ts">
  import { page } from '$app/stores';
  import KeyRound from 'lucide-svelte/icons/key-round';
  import Mail from 'lucide-svelte/icons/mail';
  import MonitorSmartphone from 'lucide-svelte/icons/monitor-smartphone';
  import TerminalSquare from 'lucide-svelte/icons/square-terminal';
  import ShieldCheck from 'lucide-svelte/icons/shield-check';
  import UserRound from 'lucide-svelte/icons/user-round';
  import SettingsLayout from './SettingsLayout.svelte';

  let { children } = $props<{ children: import('svelte').Snippet }>();
  const path = $derived($page.url.pathname);
</script>

{#snippet sidebar()}
    <h1>Settings</h1>
    <nav aria-label="Settings">
      <a class:active={path === '/settings/account/profile'} href="/settings/account/profile"><UserRound size={15} />Profile</a>
      <a class:active={path.startsWith('/settings/account/emails')} href="/settings/account/emails"><Mail size={15} />Emails</a>
      <a class:active={path === '/settings/account'} href="/settings/account"><ShieldCheck size={15} />Sign-in and security</a>
      <a class:active={path === '/settings/account/sessions'} href="/settings/account/sessions"><MonitorSmartphone size={15} />Sessions</a>
      <a class:active={path === '/settings/account/tokens'} href="/settings/account/tokens"><KeyRound size={15} />Developer access</a>
      <a class:active={path === '/settings/account/ssh-keys'} href="/settings/account/ssh-keys"><TerminalSquare size={15} />SSH keys</a>
    </nav>
{/snippet}
<SettingsLayout {sidebar} content={children} />

<style>
  h1{margin:0 0 12px;padding:0 10px;color:var(--text-muted);font-size:13px}nav{display:grid;gap:2px}nav a{display:flex;min-height:38px;align-items:center;gap:9px;padding:0 10px;border-radius:6px;color:var(--text-muted);font-size:12px;text-decoration:none}nav a:hover,nav a.active{background:var(--brand-soft);color:var(--text-strong)}@media(max-width:720px){nav{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>
