<script lang="ts">
  import { resolve } from '$app/paths';
  import { onDestroy } from 'svelte';
  import Check from 'lucide-svelte/icons/check';
  import Copy from 'lucide-svelte/icons/copy';
  import GitBranch from 'lucide-svelte/icons/git-branch';
  import Button from '$lib/components/Button.svelte';

  let { name, defaultBranch, cloneUrl, sshCloneUrl, canPush }: { name: string; defaultBranch: string; cloneUrl: string; sshCloneUrl: string | null; canPush: boolean } = $props();
  let protocol = $state<'https' | 'ssh'>('https');
  let copied = $state(false);
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;
  const activeCloneUrl = $derived(protocol === 'ssh' ? sshCloneUrl ?? cloneUrl : cloneUrl);
  const commands = $derived(`git remote add origin ${activeCloneUrl}\ngit branch -M ${defaultBranch}\ngit push -u origin ${defaultBranch}`);

  async function copyCommands() {
    await navigator.clipboard.writeText(commands);
    copied = true;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => (copied = false), 1600);
  }

  onDestroy(() => clearTimeout(copiedTimer));
</script>

<section class="empty-repository">
  <header>
    <span class="repository-mark"><GitBranch size={18} /></span>
    <div><h1>This repository is empty</h1><p>Push the first branch to start browsing files, commits, pull requests, and releases in {name}.</p></div>
  </header>

  {#if canPush}
    {#if sshCloneUrl}<div class="protocols" aria-label="Git protocol"><button class:active={protocol === 'https'} aria-pressed={protocol === 'https'} onclick={() => { protocol = 'https'; copied = false; }}>HTTPS</button><button class:active={protocol === 'ssh'} aria-pressed={protocol === 'ssh'} onclick={() => { protocol = 'ssh'; copied = false; }}>SSH</button></div>{/if}
    <div class="push-instructions">
      <div><strong>Push an existing repository</strong><span>Run this from your local project directory.</span></div>
      <div class="command"><pre><code>{commands}</code></pre><Button icon size="small" aria-label="Copy push commands" onclick={copyCommands}>{#if copied}<Check size={14} />{:else}<Copy size={14} />{/if}</Button></div>
    </div>
    {#if protocol === 'https'}
      <p class="auth">Git authentication is separate from your browser session. Use your Marl username and a <a href={resolve('/settings/account/tokens')}>developer token</a> as the password. Read access is enough to clone and pull; pushing requires Push code.</p>
    {:else}
      <p class="auth">Add the public half of your key under <a href={resolve('/settings/account/ssh-keys')}>SSH keys</a>. Marl matches its fingerprint to your account and checks repository access for every pull and push.</p>
    {/if}
  {:else}
    <p class="read-only">Someone with push access needs to publish the first branch before this repository can be browsed.</p>
  {/if}
</section>

<style>
  .empty-repository{width:min(780px,100%);padding:24px 0 36px}.empty-repository>header{display:grid;grid-template-columns:38px minmax(0,1fr);align-items:start;gap:13px}.repository-mark{display:grid;width:36px;height:36px;border-radius:8px;background:var(--brand-soft);color:var(--brand);place-items:center}h1{margin:1px 0 0;color:var(--text-strong);font-size:20px;font-weight:660;letter-spacing:-.025em;text-wrap:balance}header p{max-width:620px;margin:6px 0 0;color:var(--text-muted);font-size:11px;line-height:1.55;text-wrap:pretty}.protocols{display:flex;gap:3px;margin:25px 0 10px 51px}.protocols button{height:28px;padding:0 9px;border:0;border-radius:5px;background:transparent;color:var(--text-faint);font:inherit;font-size:10px;font-weight:630;cursor:pointer}.protocols button:hover{background:var(--surface-hover);color:var(--text)}.protocols button.active{background:var(--surface-muted);color:var(--text-strong)}.push-instructions{margin:25px 0 0 51px}.protocols+.push-instructions{margin-top:0}.push-instructions strong,.push-instructions span{display:block}.push-instructions strong{color:var(--text-strong);font-size:12px}.push-instructions span{margin-top:4px;color:var(--text-faint);font-size:9px}.command{position:relative;margin-top:10px}.command pre{overflow-x:auto;margin:0;padding:13px 48px 13px 14px;border-radius:7px;background:var(--surface-muted);color:var(--text);font:11px/1.75 var(--font-mono)}.command :global(.button){position:absolute;top:8px;right:8px}.auth,.read-only{max-width:690px;margin:13px 0 0 51px;color:var(--text-muted);font-size:10px;line-height:1.55;text-wrap:pretty}.auth a{color:var(--brand);font-weight:620;text-decoration:none}.auth a:hover{text-decoration:underline}@media(max-width:600px){.empty-repository{padding-top:12px}.protocols,.push-instructions,.auth,.read-only{margin-left:0}.protocols{margin-top:22px}.command pre{font-size:10px}}
</style>
