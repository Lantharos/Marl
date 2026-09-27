<script lang="ts">
  import { page } from '$app/state';
  import { untrack } from 'svelte';
  import Check from '@lucide/svelte/icons/check';
  import Copy from '@lucide/svelte/icons/copy';
  import FormShell from '$lib/components/page/FormShell.svelte';
  import Button from '$lib/components/controls/Button.svelte';
  import LinkButton from '$lib/components/controls/LinkButton.svelte';
  import Field from '$lib/components/controls/Field.svelte';
  import Select from '$lib/components/controls/Select.svelte';
  import Notice from '$lib/components/feedback/Notice.svelte';
  import { api, MarlApiError } from '$lib/api';
  import { formatAbsoluteTime } from '$lib/time';
  import type { PageData } from './$types';

  type Organization = { slug: string; name: string; kind: 'personal' | 'team'; role: 'owner' | 'admin' | 'member' };
  let { data }: { data: PageData } = $props();
  const organizations = $derived((data.shellOrganizations as Organization[]).filter((item) => item.role !== 'member'));
  const organizationOptions = $derived(
    organizations.map((item) => ({
      value: item.slug,
      label: item.kind === 'personal' ? (data.shellUser?.displayName ?? item.name) : item.name,
      description: item.kind === 'personal' ? `@${item.slug} · Personal account` : `@${item.slug} · Organization`
    }))
  );
  let organization = $state(
    untrack(() => (data.shellOrganizations as Organization[]).find((item) => item.role !== 'member')?.slug ?? '')
  );
  let token = $state('');
  let expiresAt = $state('');
  let busy = $state(false);
  let error = $state('');
  let copied = $state(false);
  const command = $derived(token ? `marl runner register --url ${page.url.origin} --token ${token}` : '');

  async function create() {
    if (!organization) return;
    busy = true;
    error = '';
    try {
      const result = await api<{ enrollment: { token: string; expiresAt: string } }>('/runner-enrollments', {
        method: 'POST',
        body: JSON.stringify({ organization, expiresMinutes: 15 })
      });
      token = result.enrollment.token;
      expiresAt = result.enrollment.expiresAt;
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'Enrollment could not be created.';
    } finally {
      busy = false;
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(command);
    copied = true;
    setTimeout(() => (copied = false), 1400);
  }
</script>

<svelte:head><title>Connect runner · Marl</title></svelte:head>
<FormShell
  backHref="/runners"
  backLabel="Runners"
  title="Connect a runner"
  description="Give one machine permission to pick up jobs for an organization."
>
  {#if token}
    <div class="grid gap-4">
      <div>
        <strong class="block text-base font-semibold text-ink-strong">Run this on the machine</strong>
        <p class="mt-1 text-sm leading-relaxed text-ink-muted">
          The enrollment token works once and expires {formatAbsoluteTime(expiresAt)}. Registration verifies Docker
          before the runner is connected.
        </p>
      </div>
      <div class="relative rounded-lg bg-canvas">
        <code class="block py-3.5 pr-12 pl-4 font-mono text-sm break-all text-ink-strong">{command}</code>
        <Button
          icon
          size="small"
          variant="ghost"
          class="absolute top-2 right-2"
          aria-label="Copy runner command"
          onclick={copy}
          >{#if copied}<Check size={15} class="text-success" />{:else}<Copy size={15} />{/if}</Button
        >
      </div>
      <LinkButton class="justify-self-end" href="/runners">I’ll finish on the machine</LinkButton>
    </div>
  {:else}
    <div class="grid gap-5">
      <p class="text-sm leading-relaxed text-ink-muted">
        Jobs run in disposable Docker containers. The runner process only manages checkouts, leases, logs, cache
        storage, and artifacts; repository commands do not execute directly on the host.
      </p>
      <Field label="Organization"
        ><Select bind:value={organization} options={organizationOptions} ariaLabel="Runner organization" /></Field
      >
      <dl class="grid gap-px overflow-hidden rounded-lg bg-line-subtle sm:grid-cols-3">
        {#each [['Enrollment window', '15 minutes'], ['Execution', 'Docker containers'], ['Required', 'Git and Docker Engine']] as [term, detail] (term)}
          <div class="bg-surface-muted px-3.5 py-3">
            <dt class="text-xs text-ink-muted">{term}</dt>
            <dd class="mt-0.5 text-sm font-semibold text-ink-strong">{detail}</dd>
          </div>
        {/each}
      </dl>
      {#if error}<Notice>{error}</Notice>{/if}
      <Button class="justify-self-end" variant="primary" loading={busy} disabled={!organization} onclick={create}
        >Create enrollment command</Button
      >
    </div>
  {/if}
</FormShell>
