<script lang="ts">
  import { goto } from '$app/navigation';
  import { navigating, page } from '$app/state';
  import ArrowDown from '@lucide/svelte/icons/arrow-down';
  import ArrowUp from '@lucide/svelte/icons/arrow-up';
  import BookOpen from '@lucide/svelte/icons/book-open';
  import FileText from '@lucide/svelte/icons/file-text';
  import Plus from '@lucide/svelte/icons/plus';
  import Trash2 from '@lucide/svelte/icons/trash';
  import { api, MarlApiError } from '#lib/api.js';
  import Button from '#lib/components/controls/Button.svelte';
  import ChipLink from '#lib/components/controls/ChipLink.svelte';
  import LinkButton from '#lib/components/controls/LinkButton.svelte';
  import EmptyState from '#lib/components/feedback/EmptyState.svelte';
  import Notice from '#lib/components/feedback/Notice.svelte';
  import MarkdownBody from '#lib/components/markdown/MarkdownBody.svelte';
  import Modal from '#lib/components/overlays/Modal.svelte';
  import Tooltip from '#lib/components/overlays/Tooltip.svelte';
  import Seo from '#lib/components/page/Seo.svelte';
  import { isoTimestamp } from '#lib/time.js';
  import type { RepositoryDocument } from './+page';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
  let editorOpen = $state(false);
  let draftDocuments = $state<RepositoryDocument[]>([]);
  let saving = $state(false);
  let saveError = $state('');
  const remainingDocuments = $derived(
    data.availableDocuments.filter((candidate) => !draftDocuments.some((document) => document.path === candidate.path))
  );
  const owner = $derived(data.repository.owner);
  const repo = $derived(data.repository.name);
  const repositoryPath = $derived(`/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
  const repositoryUrl = $derived(`https://marl.sh${repositoryPath}`);
  const seoDescription = $derived(
    data.repository.description || `${owner}/${repo} is a public Git repository hosted on Marl.`
  );
  const repositoryUpdatedAt = $derived(isoTimestamp(data.repository.updatedAt));
  const switching = $derived(navigating.to?.route.id === page.route.id);

  function documentHref(documents: RepositoryDocument[], document: RepositoryDocument) {
    return document.path === documents[0]?.path
      ? `/${owner}/${repo}`
      : `?${new URLSearchParams({ doc: document.path })}`;
  }

  function openEditor() {
    draftDocuments = [...data.documents];
    saveError = '';
    editorOpen = true;
  }

  function moveDocument(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= draftDocuments.length) return;
    const reordered = [...draftDocuments];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    draftDocuments = reordered;
  }

  async function saveDocuments() {
    saving = true;
    saveError = '';
    try {
      const result = await api<{ documents: RepositoryDocument[] }>(`/repositories/${owner}/${repo}/overview`, {
        method: 'PUT',
        body: JSON.stringify({ documents: draftDocuments.map((document) => document.path) })
      });
      const active = result.documents.find((document) => document.path === data.document?.path) ?? result.documents[0];
      await goto(active ? documentHref(result.documents, active) : `/${owner}/${repo}`, {
        invalidate: ['marl:repository-overview'],
        replace: true,
        reset: false
      });
      editorOpen = false;
    } catch (cause) {
      saveError = cause instanceof MarlApiError ? cause.message : 'The overview could not be updated.';
    } finally {
      saving = false;
    }
  }
</script>

<Seo
  title={`${owner}/${repo} · Marl`}
  description={seoDescription}
  path={repositoryPath}
  robots={data.repository.visibility === 'public' ? 'index, follow' : 'noindex, nofollow'}
  jsonLd={{
    '@context': 'https://schema.org',
    '@type': 'SoftwareSourceCode',
    name: `${owner}/${repo}`,
    description: seoDescription,
    url: repositoryUrl,
    codeRepository: repositoryUrl,
    ...(repositoryUpdatedAt ? { dateModified: repositoryUpdatedAt } : {})
  }}
/>

<article class="min-w-0">
  {#if data.documents.length || data.canManage}
    <nav aria-label="Repository documents" class="mb-5 flex flex-wrap items-center gap-1">
      {#each data.documents as document (document.path)}
        <ChipLink
          active={data.document?.path === document.path}
          href={documentHref(data.documents, document)}
          data-sveltekit-reset={false}><FileText size={14} />{document.label}</ChipLink
        >
      {/each}
      {#if data.canManage}<Tooltip text="Manage showcased files" as="label">
          {#snippet children(tooltip)}
            <Button icon size="small" variant="ghost" class="rounded-full" onclick={openEditor} {...tooltip}
              ><Plus size={15} /></Button
            >
          {/snippet}
        </Tooltip>{/if}
    </nav>
    {#if data.document}
      <div class={['transition-opacity', switching && 'opacity-50']} aria-busy={switching}>
        {#if data.document.html === null}<Notice>This document could not be loaded.</Notice>{:else}<MarkdownBody
            html={data.document.html}
            variant="document"
          />{/if}
      </div>
    {:else}
      <div class="surface">
        <EmptyState
          compact
          icon={BookOpen}
          title="No showcased files"
          description="Choose a Markdown or text file from the default branch."
        />
      </div>
    {/if}
  {:else}
    <div class="surface">
      <EmptyState
        icon={BookOpen}
        title="No project overview yet"
        description="Add a README, license, contributing guide, security policy, or code of conduct to introduce this repository."
      >
        <LinkButton size="small" href="/{owner}/{repo}/code">Browse the code</LinkButton>
      </EmptyState>
    </div>
  {/if}
</article>

<Modal
  open={editorOpen}
  title="Showcase files"
  description="Choose and arrange the documents shown on the repository overview."
  onClose={() => (editorOpen = false)}
>
  <div class="grid gap-5">
    <div class="grid gap-1">
      {#each draftDocuments as document, index (document.path)}
        <div
          class="grid grid-cols-[18px_minmax(0,1fr)_auto_auto_auto] items-center gap-2 rounded-lg bg-surface-muted py-1.5 pr-1.5 pl-3"
        >
          <FileText size={15} class="text-ink-muted" />
          <span class="min-w-0"
            ><strong class="block truncate text-sm font-semibold text-ink-strong">{document.label}</strong><span
              class="block truncate font-mono text-xs text-ink-muted">{document.path}</span
            ></span
          >
          <Button
            icon
            size="small"
            variant="ghost"
            disabled={index === 0}
            aria-label={`Move ${document.label} up`}
            onclick={() => moveDocument(index, -1)}><ArrowUp size={14} /></Button
          >
          <Button
            icon
            size="small"
            variant="ghost"
            disabled={index === draftDocuments.length - 1}
            aria-label={`Move ${document.label} down`}
            onclick={() => moveDocument(index, 1)}><ArrowDown size={14} /></Button
          >
          <Button
            icon
            size="small"
            variant="ghost"
            aria-label={`Remove ${document.label}`}
            onclick={() => (draftDocuments = draftDocuments.filter((candidate) => candidate.path !== document.path))}
            ><Trash2 size={14} /></Button
          >
        </div>
      {:else}<p class="py-2 text-sm text-ink-muted">No files selected.</p>{/each}
    </div>
    {#if remainingDocuments.length}
      <div class="grid gap-1">
        <strong class="mb-1 text-sm font-semibold text-ink-strong">Add a file</strong>
        {#each remainingDocuments as document (document.path)}
          <button
            type="button"
            class="flex items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface-hover"
            onclick={() => (draftDocuments = [...draftDocuments, document])}
            ><Plus size={14} class="text-ink-muted" /><span class="min-w-0 text-sm text-ink-strong"
              >{document.label} <span class="font-mono text-xs text-ink-muted">{document.path}</span></span
            ></button
          >
        {/each}
      </div>
    {/if}
    {#if saveError}<Notice>{saveError}</Notice>{/if}
  </div>
  {#snippet actions()}
    <Button size="small" onclick={() => (editorOpen = false)}>Cancel</Button>
    <Button size="small" variant="primary" loading={saving} onclick={saveDocuments}>Save overview</Button>
  {/snippet}
</Modal>
