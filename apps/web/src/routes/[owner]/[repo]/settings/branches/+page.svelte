<script lang="ts">
  import { page } from '$app/state';
  import { untrack } from 'svelte';
  import Minus from '@lucide/svelte/icons/minus';
  import Plus from '@lucide/svelte/icons/plus';
  import X from '@lucide/svelte/icons/x';
  import Check from '@lucide/svelte/icons/check';
  import type { MergeMethod } from '@marl/contracts';
  import { api, MarlApiError } from '$lib/api';
  import Button from '$lib/components/controls/Button.svelte';
  import Modal from '$lib/components/overlays/Modal.svelte';
  import Select from '$lib/components/controls/Select.svelte';
  import SettingRow from '$lib/components/settings/SettingRow.svelte';
  import SettingsChoices from '$lib/components/settings/SettingsChoices.svelte';
  import Notice from '$lib/components/feedback/Notice.svelte';
  import SettingsHeader from '$lib/components/settings/SettingsHeader.svelte';
  import type { BranchRule as Rule } from './+page';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  type Field = 'approvals' | 'checks' | 'conversations' | 'carry' | 'author' | 'methods';
  const defaults: Rule = {
    pattern: '*',
    requiredApprovals: 0,
    requiredChecks: [],
    requireConversations: true,
    carryApprovalsForward: false,
    allowAuthorMerge: false,
    allowedMergeMethods: ['merge', 'squash', 'rebase']
  };
  const titles: Record<Field, string> = {
    approvals: 'Required approvals',
    checks: 'Required checks',
    conversations: 'Review conversations',
    carry: 'Approvals on new revisions',
    author: 'Who can merge',
    methods: 'Merge methods'
  };
  const choices = {
    conversations: [
      {
        value: 'yes',
        label: 'Resolve before merging',
        description: 'Every current review conversation must be resolved.'
      },
      { value: 'no', label: 'Allow open conversations', description: 'Maintainers can merge with unresolved feedback.' }
    ],
    carry: [
      { value: 'no', label: 'Review each revision', description: 'New commits need fresh approvals.' },
      {
        value: 'yes',
        label: 'Carry approvals forward',
        description: 'Keep approvals when new commits arrive. Requested changes stay on their revision.'
      }
    ],
    author: [
      { value: 'no', label: 'Maintainers only', description: 'A maintainer makes the final merge decision.' },
      {
        value: 'yes',
        label: 'Authors can merge too',
        description: 'Authors may merge after the required approvals and all checks pass.'
      }
    ]
  };
  const methods: Array<{ value: MergeMethod; label: string }> = [
    { value: 'merge', label: 'Merge commit' },
    { value: 'squash', label: 'Squash' },
    { value: 'rebase', label: 'Rebase' }
  ];
  let rules = $state<Rule[]>(untrack(() => [...data.rules]));
  let pattern = $state(untrack(() => data.defaultBranch));
  let field = $state<Field | null>(null);
  let draft = $state<Rule>({ ...defaults });
  let decision = $state('no');
  let newCheck = $state('');
  let saving = $state(false);
  let error = $state('');
  const exact = $derived(rules.find((rule) => rule.pattern === pattern));
  const inherited = $derived(pattern !== '*' ? rules.find((rule) => rule.pattern === '*') : undefined);
  const current = $derived(exact ?? inherited ?? defaults);
  const branchOptions = $derived([
    { value: '*', label: 'All branches' },
    ...[
      ...new Set([
        data.defaultBranch,
        ...data.branches.map((branch) => branch.name),
        ...rules.map((rule) => rule.pattern).filter((value) => value !== '*')
      ])
    ].map((value) => ({ value, label: value }))
  ]);

  function edit(next: Field) {
    draft = {
      ...current,
      pattern,
      requiredChecks: [...current.requiredChecks],
      allowedMergeMethods: [...current.allowedMergeMethods]
    };
    decision = (
      next === 'conversations'
        ? current.requireConversations
        : next === 'carry'
          ? current.carryApprovalsForward
          : current.allowAuthorMerge
    )
      ? 'yes'
      : 'no';
    field = next;
    newCheck = '';
    error = '';
  }
  function addCheck() {
    const name = newCheck.trim();
    if (!name || draft.requiredChecks.includes(name) || draft.requiredChecks.length >= 32) return;
    draft.requiredChecks.push(name);
    newCheck = '';
  }
  function toggleMethod(method: MergeMethod) {
    draft.allowedMergeMethods = draft.allowedMergeMethods.includes(method)
      ? draft.allowedMergeMethods.filter((value) => value !== method)
      : [...draft.allowedMergeMethods, method];
  }
  async function save() {
    if (saving || !draft.allowedMergeMethods.length) return;
    const pendingCheck = newCheck.trim();
    if (
      field === 'checks' &&
      pendingCheck &&
      !draft.requiredChecks.includes(pendingCheck) &&
      draft.requiredChecks.length >= 32
    ) {
      error = 'Keep at most 32 required checks.';
      return;
    }
    if (field === 'checks') addCheck();
    if (field === 'conversations') draft.requireConversations = decision === 'yes';
    if (field === 'carry') draft.carryApprovalsForward = decision === 'yes';
    if (field === 'author') draft.allowAuthorMerge = decision === 'yes';
    saving = true;
    error = '';
    const submitted = {
      ...draft,
      requiredChecks: [...draft.requiredChecks],
      allowedMergeMethods: [...draft.allowedMergeMethods]
    };
    try {
      const result = await api<{ branchRule: Rule }>(
        `/repositories/${page.params.owner}/${page.params.repo}/branch-rules`,
        { method: 'PUT', body: JSON.stringify(submitted) }
      );
      rules = [...rules.filter((rule) => rule.pattern !== submitted.pattern), result.branchRule];
      field = null;
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'Branch rule could not be saved.';
    } finally {
      saving = false;
    }
  }
</script>

<svelte:head><title>Branches · {page.params.owner}/{page.params.repo} · Marl</title></svelte:head>
<SettingsHeader title="Branches" description="Decide what a pull needs before it can merge into each branch.">
  {#snippet action()}<div class="w-56">
      <Select bind:value={pattern} options={branchOptions} ariaLabel="Protected branch" />
    </div>{/snippet}
</SettingsHeader>
{#if !exact && inherited}<p class="mb-4 text-sm text-ink-muted">
    Using the all-branches rule. Changes create an override for <code class="font-mono text-ink">{pattern}</code>.
  </p>{/if}

<div class="grid gap-8">
  <section>
    <h2 class="mb-2.5 px-1 text-sm font-semibold text-ink-strong">Review</h2>
    <div class="divide-y divide-line-subtle surface px-4 sm:px-5">
      <SettingRow
        title="Required approvals"
        value={current.requiredApprovals === 0
          ? 'No approval required'
          : `${current.requiredApprovals} ${current.requiredApprovals === 1 ? 'approval' : 'approvals'}`}
        onclick={() => edit('approvals')}
      />
      <SettingRow
        title="Required checks"
        value={current.requiredChecks.length ? current.requiredChecks.join(' · ') : 'None required'}
        onclick={() => edit('checks')}
      />
      <SettingRow
        title="Review conversations"
        value={current.requireConversations ? 'Resolve before merging' : 'Open conversations allowed'}
        onclick={() => edit('conversations')}
      />
      <SettingRow
        title="Approvals on new revisions"
        value={current.carryApprovalsForward ? 'Carry approvals forward' : 'Review each revision'}
        onclick={() => edit('carry')}
      />
    </div>
  </section>
  <section>
    <h2 class="mb-2.5 px-1 text-sm font-semibold text-ink-strong">Merging</h2>
    <div class="divide-y divide-line-subtle surface px-4 sm:px-5">
      <SettingRow
        title="Who can merge"
        value={current.allowAuthorMerge ? 'Maintainers and eligible authors' : 'Maintainers only'}
        onclick={() => edit('author')}
      />
      <SettingRow
        title="Merge methods"
        value={methods
          .filter((method) => current.allowedMergeMethods.includes(method.value))
          .map((method) => method.label)
          .join(' · ')}
        onclick={() => edit('methods')}
      />
    </div>
  </section>
</div>

<Modal open={field !== null} size="small" title={field ? titles[field] : ''} onClose={() => !saving && (field = null)}>
  {#if field === 'approvals'}
    <div class="flex items-center justify-center gap-5 py-3">
      <Button
        icon
        aria-label="Fewer approvals"
        disabled={saving || draft.requiredApprovals === 0}
        onclick={() => draft.requiredApprovals--}><Minus size={18} /></Button
      >
      <output class="w-12 text-center text-4xl font-semibold text-ink-strong tabular-nums" aria-live="polite"
        >{draft.requiredApprovals}</output
      >
      <Button
        icon
        aria-label="More approvals"
        disabled={saving || draft.requiredApprovals === 10}
        onclick={() => draft.requiredApprovals++}><Plus size={18} /></Button
      >
    </div>
    <p class="text-center text-sm text-ink-muted">
      {draft.requiredApprovals === 0
        ? 'Pulls can merge without a review.'
        : 'Approvals required before a pull can merge.'}
      {#if draft.requiredApprovals === 0 && draft.allowAuthorMerge}Authors can merge their own pulls without a review.{/if}
    </p>
  {:else if field === 'checks'}
    <form
      class="flex gap-2"
      onsubmit={(event) => {
        event.preventDefault();
        addCheck();
      }}
    >
      <input
        class="field min-w-0 flex-1"
        aria-label="Check name"
        bind:value={newCheck}
        maxlength="240"
        placeholder="Workflow / Job name"
        disabled={saving}
        data-1p-ignore
      />
      <Button
        type="submit"
        icon
        aria-label="Add required check"
        disabled={saving ||
          !newCheck.trim() ||
          draft.requiredChecks.length >= 32 ||
          draft.requiredChecks.includes(newCheck.trim())}><Plus size={16} /></Button
      >
    </form>
    <p class="mt-2 text-xs text-ink-muted">Use the exact check name shown on a pull.</p>
    {#if draft.requiredChecks.length}
      <div class="mt-4 flex flex-wrap gap-1.5">
        {#each draft.requiredChecks as check (check)}
          <span
            class="inline-flex items-center gap-1 rounded-md bg-surface-muted py-1 pr-1 pl-2.5 font-mono text-xs text-ink"
            >{check}<button
              type="button"
              class="grid size-5 place-items-center rounded text-ink-muted hover:bg-surface-hover hover:text-ink-strong"
              aria-label={`Remove ${check}`}
              disabled={saving}
              onclick={() => (draft.requiredChecks = draft.requiredChecks.filter((value) => value !== check))}
              ><X size={12} /></button
            ></span
          >
        {/each}
      </div>
    {/if}
  {:else if field === 'methods'}
    <div class="grid gap-1.5" role="group" aria-label="Allowed merge methods">
      {#each methods as method (method.value)}
        {@const enabled = draft.allowedMergeMethods.includes(method.value)}
        <button
          type="button"
          aria-pressed={enabled}
          disabled={saving}
          class={[
            'flex h-11 items-center justify-between rounded-lg px-3.5 text-sm font-medium transition-colors',
            enabled ? 'bg-brand-soft text-ink-strong' : 'bg-surface-muted text-ink-muted hover:text-ink-strong'
          ]}
          onclick={() => toggleMethod(method.value)}
          >{method.label}{#if enabled}<Check size={15} class="text-brand" />{/if}</button
        >
      {/each}
    </div>
    <p class="mt-3 text-xs text-ink-muted">Keep at least one merge method available.</p>
  {:else if field}
    <SettingsChoices bind:value={decision} options={choices[field]} label={titles[field]} disabled={saving} />
    {#if field === 'author' && decision === 'yes' && draft.requiredApprovals === 0}<p
        class="mt-3 text-sm text-ink-muted"
      >
        This branch requires no approvals. Authors can merge without a review.
      </p>{/if}
  {/if}
  {#if error}<Notice class="mt-4">{error}</Notice>{/if}
  {#snippet actions()}
    <Button size="small" disabled={saving} onclick={() => (field = null)}>Cancel</Button>
    <Button size="small" variant="primary" loading={saving} disabled={!draft.allowedMergeMethods.length} onclick={save}
      >Save</Button
    >
  {/snippet}
</Modal>
