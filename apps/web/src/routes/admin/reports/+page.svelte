<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import type { AbuseReport } from '@marl/contracts';
  import Flag from '@lucide/svelte/icons/flag';
  import { api, MarlApiError } from '$lib/api';
  import Button from '$lib/components/controls/Button.svelte';
  import Field from '$lib/components/controls/Field.svelte';
  import EmptyState from '$lib/components/feedback/EmptyState.svelte';
  import Notice from '$lib/components/feedback/Notice.svelte';
  import Modal from '$lib/components/overlays/Modal.svelte';
  import Page from '$lib/components/page/Page.svelte';
  import PageHeader from '$lib/components/page/PageHeader.svelte';
  import TabLinks from '$lib/components/page/TabLinks.svelte';
  import Time from '$lib/components/page/Time.svelte';
  import type { PageData } from './$types';

  type Action = 'dismiss' | 'remove_content' | 'disable_repository' | 'suspend_user';

  let { data }: { data: PageData } = $props();
  let pending = $state<{ report: AbuseReport; action: Action } | null>(null);
  let note = $state('');
  let busy = $state(false);
  let error = $state('');
  const reasons: Record<AbuseReport['reason'], string> = {
    spam: 'Spam',
    malware: 'Malware or phishing',
    harassment: 'Harassment or hate',
    copyright: 'Copyright',
    private_information: 'Private information',
    illegal: 'Illegal content',
    other: 'Other'
  };
  const actionCopy: Record<Action, { label: string; title: string; description: string; notePlaceholder: string }> = {
    dismiss: {
      label: 'Dismiss',
      title: 'Dismiss this report?',
      description: 'Nothing changes for the reported content.',
      notePlaceholder: 'Why no action was needed'
    },
    remove_content: {
      label: 'Remove comment',
      title: 'Remove this comment?',
      description: 'The comment is replaced with a deleted marker for everyone.',
      notePlaceholder: 'Internal note'
    },
    disable_repository: {
      label: 'Disable repository',
      title: 'Disable this repository?',
      description: 'The repository becomes unavailable over the web and Git, and its owners are emailed your reason.',
      notePlaceholder: 'Reason shown to the owners and visitors'
    },
    suspend_user: {
      label: 'Suspend author',
      title: 'Suspend this account?',
      description: 'The author is signed out, their tokens are revoked, and their personal repositories are disabled.',
      notePlaceholder: 'Reason sent to the account holder'
    }
  };
  const commentTypes = new Set(['issue_comment', 'pull_comment', 'review_comment']);

  function actionsFor(report: AbuseReport): Action[] {
    if (!report.subject) return ['dismiss'];
    return [
      'dismiss',
      ...(commentTypes.has(report.subjectType) ? (['remove_content'] as const) : []),
      ...(report.subject.repository ? (['disable_repository'] as const) : []),
      ...(report.subject.author ? (['suspend_user'] as const) : [])
    ];
  }

  async function resolve() {
    if (!pending) return;
    busy = true;
    error = '';
    try {
      await api(`/admin/reports/${pending.report.id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ action: pending.action, note })
      });
      pending = null;
      await invalidateAll();
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'The report could not be resolved.';
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Moderation · Marl</title></svelte:head>
<Page>
  <PageHeader
    title="Reports"
    description="Reports people filed about content on Marl. Oldest open reports come first."
  />
  <TabLinks
    label="Report state"
    class="mb-5"
    items={[
      { href: '/admin/reports', label: 'Open', active: data.state === 'open' },
      { href: '/admin/reports?state=closed', label: 'Resolved', active: data.state === 'closed' }
    ]}
  />
  {#if data.reports.length}
    <div class="grid gap-3">
      {#each data.reports as report (report.id)}
        <article class="surface p-4 sm:p-5">
          <header class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
            <span class="rounded-full bg-danger-soft px-2.5 py-0.5 text-xs font-semibold text-danger"
              >{reasons[report.reason]}</span
            >
            <span
              >Reported by <a class="font-medium text-ink hover:text-brand" href="/{report.reporter}"
                >@{report.reporter}</a
              ></span
            >
            <Time value={report.createdAt} class="text-ink-muted" />
            {#if report.state !== 'open'}<span class="ml-auto text-xs font-semibold capitalize">{report.state}</span
              >{/if}
          </header>
          {#if report.subject}
            <a class="mt-3 block text-base font-semibold text-ink-strong hover:text-brand" href={report.subject.href}
              >{report.subject.title}</a
            >
            {#if report.subject.author}<p class="mt-0.5 text-xs text-ink-muted">by @{report.subject.author}</p>{/if}
            {#if report.subject.excerpt}<p class="mt-2 line-clamp-4 text-sm whitespace-pre-wrap text-ink">
                {report.subject.excerpt}
              </p>{/if}
          {:else}
            <p class="mt-3 text-sm text-ink-muted italic">The reported content no longer exists.</p>
          {/if}
          {#if report.details}
            <blockquote class="mt-3 border-l-2 border-line-strong pl-3 text-sm whitespace-pre-wrap text-ink-muted">
              {report.details}
            </blockquote>
          {/if}
          {#if report.state === 'open'}
            <footer class="mt-4 flex flex-wrap gap-2">
              {#each actionsFor(report) as action (action)}
                <Button
                  size="small"
                  variant={action === 'dismiss' ? 'secondary' : 'danger-soft'}
                  onclick={() => {
                    note = '';
                    error = '';
                    pending = { report, action };
                  }}>{actionCopy[action].label}</Button
                >
              {/each}
            </footer>
          {/if}
        </article>
      {/each}
    </div>
  {:else}
    <div class="surface">
      <EmptyState icon={Flag} title={data.state === 'open' ? 'No open reports' : 'No resolved reports'} />
    </div>
  {/if}
</Page>

<Modal
  open={pending !== null}
  size="small"
  title={pending ? actionCopy[pending.action].title : ''}
  onClose={() => !busy && (pending = null)}
>
  {#if pending}
    <div class="grid gap-4">
      <p class="text-sm leading-relaxed text-ink-muted">{actionCopy[pending.action].description}</p>
      <Field label="Note" optional={pending.action === 'dismiss' || pending.action === 'remove_content'}>
        <textarea
          class="field min-h-20 resize-y py-3 leading-relaxed"
          bind:value={note}
          maxlength="1000"
          placeholder={actionCopy[pending.action].notePlaceholder}></textarea>
      </Field>
      {#if error}<Notice>{error}</Notice>{/if}
    </div>
  {/if}
  {#snippet actions()}
    <Button size="small" disabled={busy} onclick={() => (pending = null)}>Cancel</Button>
    <Button
      size="small"
      variant={pending?.action === 'dismiss' ? 'primary' : 'danger'}
      loading={busy}
      disabled={(pending?.action === 'disable_repository' || pending?.action === 'suspend_user') && !note.trim()}
      onclick={resolve}>{pending ? actionCopy[pending.action].label : ''}</Button
    >
  {/snippet}
</Modal>
