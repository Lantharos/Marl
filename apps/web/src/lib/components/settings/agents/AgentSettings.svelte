<script lang="ts">
  import { untrack } from 'svelte';
  import type { Agent } from '@marl/contracts';
  import Bot from '@lucide/svelte/icons/bot';
  import { api, MarlApiError } from '$lib/api';
  import Button from '../../controls/Button.svelte';
  import Field from '../../controls/Field.svelte';
  import EmptyState from '../../feedback/EmptyState.svelte';
  import Notice from '../../feedback/Notice.svelte';
  import UserAvatar from '../../identity/UserAvatar.svelte';
  import ActionMenu from '../../overlays/ActionMenu.svelte';
  import ConfirmDialog from '../../overlays/ConfirmDialog.svelte';
  import Modal from '../../overlays/Modal.svelte';
  import SettingsHeader from '../SettingsHeader.svelte';
  import AgentTokens from './AgentTokens.svelte';

  let { initialAgents, endpoint }: { initialAgents: Agent[]; endpoint: string } = $props();
  let agents = $state<Agent[]>(untrack(() => initialAgents));
  let editing = $state<Agent | null | undefined>(undefined);
  let tokensFor = $state<Agent | null>(null);
  let removing = $state<Agent | null>(null);
  let handle = $state('');
  let displayName = $state('');
  let description = $state('');
  let busy = $state(false);
  let error = $state('');

  function open(agent: Agent | null) {
    handle = agent?.handle ?? '';
    displayName = agent?.displayName ?? '';
    description = agent?.description ?? '';
    error = '';
    editing = agent;
  }

  async function save() {
    busy = true;
    error = '';
    try {
      if (editing) {
        const result = await api<{ agent: Agent }>(`/agents/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ displayName, description })
        });
        agents = agents.map((agent) => (agent.id === result.agent.id ? result.agent : agent));
      } else {
        const result = await api<{ agent: Agent }>(endpoint, {
          method: 'POST',
          body: JSON.stringify({ handle, displayName, description })
        });
        agents = [...agents, result.agent];
        tokensFor = result.agent;
      }
      editing = undefined;
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'The agent could not be saved.';
    } finally {
      busy = false;
    }
  }

  async function remove() {
    if (!removing) return;
    busy = true;
    error = '';
    try {
      await api(`/agents/${removing.id}`, { method: 'DELETE' });
      agents = agents.filter((agent) => agent.id !== removing!.id);
      removing = null;
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'The agent could not be deleted.';
    } finally {
      busy = false;
    }
  }
</script>

<SettingsHeader
  title="Agents"
  description="Accounts for bots and AI tools that act on your behalf. Their work is labeled as theirs, and they only reach repositories you add them to."
>
  {#snippet action()}<Button size="small" onclick={() => open(null)}>New agent</Button>{/snippet}
</SettingsHeader>
{#if error && editing === undefined && !removing}<Notice class="mb-4">{error}</Notice>{/if}

<div class="divide-y divide-line-subtle surface px-4 sm:px-5">
  {#each agents as agent (agent.id)}
    <article class="grid min-h-19 grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 py-3">
      <UserAvatar name={agent.displayName} src={agent.avatarUrl} size={36} />
      <a class="min-w-0" href="/{agent.handle}">
        <strong class="flex items-center gap-1.5 truncate text-sm font-semibold text-ink-strong"
          >{agent.displayName}<Bot size={13} class="shrink-0 text-ink-muted" /></strong
        >
        <span class="block truncate text-xs text-ink-muted"
          >@{agent.handle} · {agent.repositories}
          {agent.repositories === 1 ? 'repository' : 'repositories'} · {agent.activeTokens}
          {agent.activeTokens === 1 ? 'token' : 'tokens'}</span
        >
      </a>
      <ActionMenu
        label="Options for {agent.displayName}"
        actions={[
          { label: 'Tokens', onSelect: () => (tokensFor = agent) },
          { label: 'Edit', onSelect: () => open(agent) },
          { label: 'Delete', danger: true, onSelect: () => (removing = agent) }
        ]}
      />
    </article>
  {:else}
    <EmptyState
      icon={Bot}
      compact
      title="No agents"
      description="Create one for a CI bot, a review assistant, or any tool that should comment and push under its own name."
    />
  {/each}
</div>

<Modal
  open={editing !== undefined}
  size="small"
  title={editing ? 'Edit agent' : 'New agent'}
  onClose={() => !busy && (editing = undefined)}
>
  <form
    id="agent-form"
    class="grid gap-4"
    onsubmit={(event) => {
      event.preventDefault();
      void save();
    }}
  >
    <Field label="Name"
      ><input
        class="field"
        bind:value={displayName}
        maxlength="80"
        placeholder="Review Assistant"
        required
        data-1p-ignore
      /></Field
    >
    {#if !editing}
      <Field label="Username" hint="Shown as @{handle || 'username'} on everything this agent does.">
        <input
          class="field"
          bind:value={handle}
          oninput={() => (handle = handle.toLowerCase())}
          minlength="2"
          maxlength="39"
          pattern="[a-z0-9](?:(?:[a-z0-9._]|-)*[a-z0-9])?"
          required
          data-1p-ignore
        />
      </Field>
    {/if}
    <Field label="Description" optional>
      <textarea class="field min-h-20 resize-y py-3 leading-relaxed" bind:value={description} maxlength="280"
      ></textarea>
    </Field>
    {#if error}<Notice>{error}</Notice>{/if}
  </form>
  {#snippet actions()}
    <Button size="small" disabled={busy} onclick={() => (editing = undefined)}>Cancel</Button>
    <Button
      size="small"
      variant="primary"
      type="submit"
      form="agent-form"
      loading={busy}
      disabled={!displayName.trim() || (!editing && handle.length < 2)}>{editing ? 'Save' : 'Create agent'}</Button
    >
  {/snippet}
</Modal>

<AgentTokens agent={tokensFor} onClose={() => (tokensFor = null)} />

<ConfirmDialog
  open={removing !== null}
  title="Delete agent?"
  confirmLabel="Delete agent"
  {busy}
  {error}
  onConfirm={remove}
  onClose={() => (removing = null)}
>
  <strong>@{removing?.handle}</strong> loses all tokens and repository access. Its past work stays, attributed to a deleted
  agent.
</ConfirmDialog>
