<script lang="ts">
  import { untrack } from 'svelte';
  import type { DeveloperToken } from '@marl/contracts';
  import Check from '@lucide/svelte/icons/check';
  import KeyRound from '@lucide/svelte/icons/key-round';
  import Trash2 from '@lucide/svelte/icons/trash';
  import Button from '$lib/components/controls/Button.svelte';
  import Checkbox from '$lib/components/controls/Checkbox.svelte';
  import Modal from '$lib/components/overlays/Modal.svelte';
  import Field from '$lib/components/controls/Field.svelte';
  import EmptyState from '$lib/components/feedback/EmptyState.svelte';
  import Notice from '$lib/components/feedback/Notice.svelte';
  import ConfirmDialog from '$lib/components/overlays/ConfirmDialog.svelte';
  import SettingsHeader from '$lib/components/settings/SettingsHeader.svelte';
  import { api, MarlApiError } from '$lib/api';
  import { formatDate, formatTimestamp } from '$lib/time';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let tokens = $state(untrack(() => [...data.tokens]));
  let tokenDialog = $state(false);
  let tokenName = $state('');
  let scopeChoices = $state([
    { scope: 'repo:read', label: 'Read repositories', checked: true },
    { scope: 'repo:write', label: 'Push code', checked: false },
    { scope: 'repo:admin', label: 'Manage repositories', checked: false },
    { scope: 'workflow:dispatch', label: 'Dispatch workflows', checked: false }
  ]);
  let newToken = $state('');
  let busy = $state(false);
  let copied = $state(false);
  let error = $state('');
  let revoking = $state<(typeof tokens)[number] | null>(null);

  async function createToken() {
    const scopes = scopeChoices.filter((choice) => choice.checked).map((choice) => choice.scope);
    if (!tokenName.trim() || !scopes.length) return;
    busy = true;
    error = '';
    try {
      const result = await api<{
        token: Omit<DeveloperToken, 'createdAt' | 'lastUsedAt'> & { value: string };
      }>('/tokens', { method: 'POST', body: JSON.stringify({ name: tokenName, scopes, expiresDays: 90 }) });
      const { value, ...token } = result.token;
      newToken = value;
      tokens = [{ ...token, createdAt: new Date().toISOString(), lastUsedAt: null }, ...tokens];
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'The developer token could not be created.';
    } finally {
      busy = false;
    }
  }

  function scopeLabel(scope: string) {
    return scopeChoices.find((choice) => choice.scope === scope)?.label ?? scope;
  }

  async function revokeToken(id: string) {
    busy = true;
    error = '';
    try {
      await api(`/tokens/${id}`, { method: 'DELETE' });
      tokens = tokens.filter((token) => token.id !== id);
      revoking = null;
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'The developer token could not be revoked.';
    } finally {
      busy = false;
    }
  }

  async function copyToken() {
    await navigator.clipboard.writeText(newToken);
    copied = true;
    setTimeout(() => (copied = false), 1800);
  }
</script>

<svelte:head><title>Developer access · Marl</title></svelte:head>
<SettingsHeader title="Developer access" description="Scoped credentials for Git, the Marl CLI, and automation.">
  {#snippet action()}<Button
      size="small"
      onclick={() => {
        tokenDialog = true;
        newToken = '';
        tokenName = '';
        copied = false;
        error = '';
      }}>Create token</Button
    >{/snippet}
</SettingsHeader>
{#if error && !tokenDialog && !revoking}<Notice class="mb-4">{error}</Notice>{/if}
<div class="divide-y divide-line-subtle surface px-4 sm:px-5">
  {#each tokens as token (token.id)}
    <article class="grid min-h-20 grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-3 py-3">
      <KeyRound size={18} class="text-ink-muted" />
      <div class="min-w-0">
        <strong class="block truncate text-base font-semibold text-ink-strong">{token.name}</strong>
        <span class="mt-0.5 block text-sm text-ink-muted">{token.scopes.map(scopeLabel).join(', ')}</span>
        <span class="mt-0.5 block text-xs text-ink-faint"
          ><code class="font-mono">{token.tokenPrefix}…</code> · expires {formatDate(token.expiresAt)} · {token.lastUsedAt
            ? `last used ${formatTimestamp(token.lastUsedAt)}`
            : 'never used'}</span
        >
      </div>
      <Button
        variant="ghost"
        size="small"
        icon
        aria-label={`Revoke ${token.name}`}
        onclick={() => {
          error = '';
          revoking = token;
        }}><Trash2 size={15} /></Button
      >
    </article>
  {:else}
    <EmptyState
      compact
      icon={KeyRound}
      title="No developer tokens"
      description="Create a token to push over HTTPS or automate Marl from scripts."
    />
  {/each}
</div>

{#snippet tokenActions()}
  {#if newToken}<Button size="small" variant="primary" onclick={() => (tokenDialog = false)}>Done</Button>{:else}
    <Button size="small" onclick={() => (tokenDialog = false)}>Cancel</Button>
    <Button
      size="small"
      variant="primary"
      loading={busy}
      disabled={!tokenName.trim() || !scopeChoices.some((choice) => choice.checked)}
      onclick={createToken}>Create token</Button
    >
  {/if}
{/snippet}
<Modal
  open={tokenDialog}
  title={newToken ? 'Copy your token' : 'Create developer token'}
  description={newToken
    ? 'This is the only time the secret is shown. Store it somewhere safe.'
    : 'Tokens expire after 90 days.'}
  onClose={() => (tokenDialog = false)}
  actions={tokenActions}
>
  {#if newToken}
    <div class="grid gap-3">
      <code class="rounded-lg bg-canvas p-3 font-mono text-sm break-all text-ink-strong">{newToken}</code>
      <Button size="small" class="justify-self-end" disabled={copied} onclick={copyToken}
        >{#if copied}<Check size={14} />Copied{:else}Copy token{/if}</Button
      >
    </div>
  {:else}
    <div class="grid gap-4">
      <Field label="Name"><input class="field" bind:value={tokenName} placeholder="Laptop or deployment" /></Field>
      <fieldset class="grid gap-1">
        <legend class="mb-1.5 text-sm font-semibold text-ink-strong">Access</legend>
        {#each scopeChoices as choice (choice.scope)}<Checkbox
            bind:checked={choice.checked}
            label={choice.label}
          />{/each}
      </fieldset>
    </div>
  {/if}
  {#if error}<Notice class="mt-4">{error}</Notice>{/if}
</Modal>

<ConfirmDialog
  open={revoking !== null}
  title="Revoke token?"
  confirmLabel="Revoke token"
  {busy}
  {error}
  onConfirm={() => revoking && void revokeToken(revoking.id)}
  onClose={() => (revoking = null)}
>
  Anything using <strong>{revoking?.name}</strong> will lose access immediately.
</ConfirmDialog>
