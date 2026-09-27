<script lang="ts">
  import type { Agent, DeveloperToken } from '@marl/contracts';
  import Check from '@lucide/svelte/icons/check';
  import Copy from '@lucide/svelte/icons/copy';
  import Trash2 from '@lucide/svelte/icons/trash';
  import { api, MarlApiError } from '$lib/api';
  import { formatDate } from '$lib/time';
  import Button from '../../controls/Button.svelte';
  import Checkbox from '../../controls/Checkbox.svelte';
  import Field from '../../controls/Field.svelte';
  import Spinner from '../../feedback/Spinner.svelte';
  import Notice from '../../feedback/Notice.svelte';
  import Modal from '../../overlays/Modal.svelte';

  let { agent, onClose }: { agent: Agent | null; onClose: () => void } = $props();
  const scopeChoices = [
    { scope: 'repo:read', label: 'Read repositories', description: 'Clone and read code, issues, and pulls.' },
    { scope: 'repo:write', label: 'Write', description: 'Push code, comment, and open issues and pulls.' },
    { scope: 'workflow:dispatch', label: 'Dispatch workflows', description: 'Start workflows that allow manual runs.' }
  ];
  let tokens = $state<DeveloperToken[] | null>(null);
  let name = $state('');
  let scopes = $state<string[]>(['repo:read']);
  let expiresDays = $state(90);
  let created = $state('');
  let copied = $state(false);
  let busy = $state(false);
  let error = $state('');

  $effect(() => {
    if (!agent) return;
    tokens = null;
    created = '';
    name = '';
    error = '';
    void api<{ tokens: DeveloperToken[] }>(`/agents/${agent.id}/tokens`).then((result) => (tokens = result.tokens));
  });

  async function create() {
    if (!agent || !name.trim() || !scopes.length) return;
    busy = true;
    error = '';
    try {
      const result = await api<{ token: DeveloperToken & { value: string } }>(`/agents/${agent.id}/tokens`, {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), scopes, expiresDays })
      });
      const { value, ...token } = result.token;
      created = value;
      copied = false;
      tokens = [{ ...token, createdAt: new Date().toISOString(), lastUsedAt: null }, ...(tokens ?? [])];
      name = '';
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'The token could not be created.';
    } finally {
      busy = false;
    }
  }

  async function revoke(token: DeveloperToken) {
    if (!agent) return;
    await api(`/agents/${agent.id}/tokens/${token.id}`, { method: 'DELETE' });
    tokens = (tokens ?? []).filter((item) => item.id !== token.id);
  }
</script>

<Modal
  open={agent !== null}
  title="Tokens for {agent?.displayName ?? ''}"
  description="Tokens let this agent use the API and Git as @{agent?.handle}. Access is limited to repositories it has been added to."
  {onClose}
>
  <div class="grid gap-5">
    {#if created}
      <div class="grid gap-2 rounded-xl bg-success-soft p-3">
        <strong class="text-sm font-semibold text-ink-strong">Copy this token now. It won’t be shown again.</strong>
        <div class="flex field min-h-0 items-center gap-1 p-0 pl-3">
          <code class="min-w-0 flex-1 truncate py-2.5 font-mono text-xs text-ink">{created}</code>
          <Button
            icon
            size="small"
            variant="ghost"
            aria-label="Copy token"
            onclick={async () => {
              await navigator.clipboard.writeText(created);
              copied = true;
            }}
            >{#if copied}<Check size={15} class="text-success" />{:else}<Copy size={15} />{/if}</Button
          >
        </div>
      </div>
    {/if}
    <form
      class="grid gap-4"
      onsubmit={(event) => {
        event.preventDefault();
        void create();
      }}
    >
      <Field label="Token name"
        ><input class="field" bind:value={name} maxlength="120" placeholder="Review bot on CI" data-1p-ignore /></Field
      >
      <div class="grid gap-0.5 rounded-xl bg-surface p-1">
        {#each scopeChoices as choice (choice.scope)}
          <Checkbox
            checked={scopes.includes(choice.scope)}
            label={choice.label}
            description={choice.description}
            onchange={(checked) =>
              (scopes = checked ? [...scopes, choice.scope] : scopes.filter((scope) => scope !== choice.scope))}
          />
        {/each}
      </div>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <span class="text-xs text-ink-muted">Expires after {expiresDays} days</span>
        <Button size="small" variant="primary" type="submit" loading={busy} disabled={!name.trim() || !scopes.length}
          >Create token</Button
        >
      </div>
      {#if error}<Notice>{error}</Notice>{/if}
    </form>
    <section>
      <h3 class="mb-2 text-sm font-semibold text-ink-strong">Active tokens</h3>
      {#if tokens === null}<span class="flex items-center gap-2 text-sm text-ink-muted"><Spinner />Loading</span>
      {:else}
        <div class="grid gap-0.5">
          {#each tokens as token (token.id)}
            <div
              class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-2.5 py-2 hover:bg-surface-hover"
            >
              <span class="min-w-0">
                <strong class="block truncate text-sm font-semibold text-ink-strong">{token.name}</strong>
                <span class="block truncate text-xs text-ink-muted"
                  >{token.scopes.join(', ')} · expires {formatDate(token.expiresAt)}{token.lastUsedAt
                    ? ` · used ${formatDate(token.lastUsedAt)}`
                    : ''}</span
                >
              </span>
              <Button icon size="small" variant="ghost" aria-label="Revoke {token.name}" onclick={() => revoke(token)}
                ><Trash2 size={14} /></Button
              >
            </div>
          {:else}
            <p class="text-sm text-ink-muted">No active tokens.</p>
          {/each}
        </div>
      {/if}
    </section>
  </div>
</Modal>
