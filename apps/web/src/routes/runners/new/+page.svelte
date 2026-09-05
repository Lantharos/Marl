<script lang="ts">
  import { page } from '$app/stores';
  import { untrack } from 'svelte';
  import Check from 'lucide-svelte/icons/check';
  import Copy from 'lucide-svelte/icons/copy';
  import FormShell from '$lib/components/FormShell.svelte';
  import Button from '$lib/components/Button.svelte';
  import LinkButton from '$lib/components/LinkButton.svelte';
  import Select from '$lib/components/Select.svelte';
  import { api, MarlApiError } from '$lib/api';
  import type { PageData } from './$types';

  type Organization = { slug: string; name: string; kind: 'personal' | 'team'; role: 'owner' | 'admin' | 'member' };
  let { data } = $props<{ data: PageData }>();
  const organizations = $derived((data.shellOrganizations as Organization[]).filter((item) => item.role !== 'member'));
  const organizationOptions = $derived(organizations.map((item) => ({ value: item.slug, label: item.kind === 'personal' ? data.shellUser.displayName : item.name, description: item.kind === 'personal' ? `@${item.slug} · Personal account` : `@${item.slug} · Organization` })));
  let organization = $state(untrack(() => (data.shellOrganizations as Organization[]).find((item) => item.role !== 'member')?.slug ?? ''));
  let token = $state('');
  let expiresAt = $state('');
  let busy = $state(false);
  let error = $state('');
  let copied = $state(false);
  const command = $derived(token ? `marl runner register --url ${$page.url.origin} --token ${token}` : '');

  async function create() {
    if (!organization) return;
    busy = true; error = '';
    try {
      const result = await api<{ enrollment: { token: string; expiresAt: string } }>('/runner-enrollments', { method: 'POST', body: JSON.stringify({ organization, expiresMinutes: 15 }) });
      token = result.enrollment.token; expiresAt = result.enrollment.expiresAt;
    } catch (cause) { error = cause instanceof MarlApiError ? cause.message : 'Enrollment could not be created.'; }
    finally { busy = false; }
  }

  async function copy() { await navigator.clipboard.writeText(command); copied = true; setTimeout(() => (copied = false), 1400); }
</script>

<svelte:head><title>Connect runner · Marl</title></svelte:head>
<FormShell backHref="/runners" backLabel="Runners" title="Connect a runner" description="Give one machine permission to pick up jobs for an organization.">
  {#if token}
    <div class="ready"><strong>Run this on the machine</strong><p>The enrollment token works once and expires at {expiresAt}. Registration verifies Docker before the runner is connected.</p><div><code>{command}</code><Button icon aria-label="Copy runner command" onclick={copy}>{#if copied}<Check size={14} />{:else}<Copy size={14} />{/if}</Button></div><LinkButton class="done" href="/runners">I'll finish on the machine</LinkButton></div>
  {:else}
    <div class="explain"><p>Jobs run in disposable Docker containers. The runner process only manages checkouts, leases, logs, cache storage, and artifacts; repository commands do not execute directly on the host.</p><label><span>Organization</span><Select bind:value={organization} options={organizationOptions} ariaLabel="Runner organization" /></label><dl><div><dt>Enrollment window</dt><dd>15 minutes</dd></div><div><dt>Execution</dt><dd>Docker containers</dd></div><div><dt>Required</dt><dd>Git and Docker Engine</dd></div></dl>{#if error}<p class="error" role="alert">{error}</p>{/if}<Button class="connect" variant="primary" loading={busy} disabled={!organization} onclick={create}>Create enrollment command</Button></div>
  {/if}
</FormShell>

<style>
  .explain>p,.ready>p{margin:0 0 18px;color:var(--text-muted);font-size:12px;line-height:1.6}.explain>label{display:grid;gap:7px;margin-bottom:12px}.explain>label>span{color:var(--text-strong);font-size:11px;font-weight:630}dl{margin:0}dl>div{display:flex;gap:16px;flex-wrap:wrap;justify-content:space-between;padding:11px 0;font-size:11px}dt{color:var(--text-faint)}dd{margin:0;color:var(--text-strong)}.explain :global(.connect.button){display:flex;margin:20px 0 0 auto}.error{color:var(--danger)!important}.ready>strong{display:block;margin-bottom:5px;color:var(--text-strong);font-size:13px}.ready>div{display:grid;grid-template-columns:minmax(0,1fr) 36px;border:1px solid var(--border);border-radius:6px;background:var(--surface)}.ready code{overflow:auto;padding:12px;color:var(--text);font-size:11px;white-space:nowrap}.ready>div :global(.button){height:100%;border-width:0 0 0 1px;border-radius:0 6px 6px 0}.ready :global(.done.link-button){margin-top:17px}
</style>
