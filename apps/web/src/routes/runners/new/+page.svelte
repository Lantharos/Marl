<script lang="ts">
  import Check from 'lucide-svelte/icons/check';
  import Copy from 'lucide-svelte/icons/copy';
  import FormShell from '$lib/components/FormShell.svelte';
  import Button from '$lib/components/Button.svelte';
  import LinkButton from '$lib/components/LinkButton.svelte';
  import { api, MarlApiError } from '$lib/api';

  let token = $state('');
  let expiresAt = $state('');
  let busy = $state(false);
  let error = $state('');
  let copied = $state(false);
  const command = $derived(token ? `marl runner register --url https://marl.sh --token ${token}` : '');

  async function create() {
    busy = true; error = '';
    try {
      const result = await api<{ enrollment: { token: string; expiresAt: string } }>('/runner-enrollments', { method: 'POST', body: JSON.stringify({ organization: 'lantharos', expiresMinutes: 15 }) });
      token = result.enrollment.token; expiresAt = result.enrollment.expiresAt;
    } catch (cause) { error = cause instanceof MarlApiError ? cause.message : 'Enrollment could not be created.'; }
    finally { busy = false; }
  }

  async function copy() { await navigator.clipboard.writeText(command); copied = true; setTimeout(() => (copied = false), 1400); }
</script>

<svelte:head><title>Connect runner · Marl</title></svelte:head>
<FormShell title="Connect a runner" description="Give one machine permission to pick up jobs for lantharos.">
  {#if token}
    <div class="ready"><strong>Run this on the machine</strong><p>The enrollment token works once and expires at {expiresAt}. Registration verifies Docker before the runner is connected.</p><div><code>{command}</code><Button icon aria-label="Copy runner command" onclick={copy}>{#if copied}<Check size={14} />{:else}<Copy size={14} />{/if}</Button></div><LinkButton class="done" href="/runners">I'll finish on the machine</LinkButton></div>
  {:else}
    <div class="explain"><p>Jobs run in disposable Docker containers. The runner process only manages checkouts, leases, logs, cache storage, and artifacts; repository commands do not execute directly on the host.</p><dl><div><dt>Organization</dt><dd>lantharos</dd></div><div><dt>Enrollment window</dt><dd>15 minutes</dd></div><div><dt>Execution</dt><dd>Docker containers</dd></div><div><dt>Required</dt><dd>Git and Docker Engine</dd></div></dl>{#if error}<p class="error" role="alert">{error}</p>{/if}<Button class="connect" variant="primary" loading={busy} onclick={create}>Create enrollment command</Button></div>
  {/if}
</FormShell>

<style>
  .explain>p,.ready>p{margin:0 0 18px;color:var(--text-muted);font-size:12px;line-height:1.6}dl{margin:0}dl>div{display:flex;justify-content:space-between;padding:11px 0;border-bottom:1px solid var(--border-subtle);font-size:11px}dt{color:var(--text-faint)}dd{margin:0;color:var(--text-strong)}.explain :global(.connect.button){display:flex;margin:20px 0 0 auto}.error{color:var(--danger)!important}.ready>strong{display:block;margin-bottom:5px;color:var(--text-strong);font-size:13px}.ready>div{display:grid;grid-template-columns:minmax(0,1fr) 36px;border:1px solid var(--border);border-radius:6px;background:var(--surface)}.ready code{overflow:auto;padding:12px;color:var(--text);font-size:10px;white-space:nowrap}.ready>div :global(.button){height:100%;border-width:0 0 0 1px;border-radius:0 6px 6px 0}.ready :global(.done.link-button){margin-top:17px}
</style>
