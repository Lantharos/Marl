<script lang="ts">
  import { page } from '$app/state';
  import { untrack } from 'svelte';
  import ArrowDown from '@lucide/svelte/icons/arrow-down';
  import ArrowUp from '@lucide/svelte/icons/arrow-up';
  import BookOpen from '@lucide/svelte/icons/book-open';
  import FileText from '@lucide/svelte/icons/file-text';
  import Plus from '@lucide/svelte/icons/plus';
  import Trash2 from '@lucide/svelte/icons/trash';
  import GitBranch from '@lucide/svelte/icons/git-branch';
  import GitFork from '@lucide/svelte/icons/git-fork';
  import Star from '@lucide/svelte/icons/star';
  import { api, MarlApiError } from '$lib/api';
  import Button from '$lib/components/controls/Button.svelte';
  import LinkButton from '$lib/components/controls/LinkButton.svelte';
  import EmptyState from '$lib/components/feedback/EmptyState.svelte';
  import Notice from '$lib/components/feedback/Notice.svelte';
  import Spinner from '$lib/components/feedback/Spinner.svelte';
  import MarkdownBody from '$lib/components/markdown/MarkdownBody.svelte';
  import Modal from '$lib/components/overlays/Modal.svelte';
  import Seo from '$lib/components/page/Seo.svelte';
  import Time from '$lib/components/page/Time.svelte';
  import { repositoryDocumentPath } from '$lib/repositories/repository-path';
  import { isoTimestamp } from '$lib/time';
  import type { RepositoryDocument } from './+page';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const owner = $derived(page.params.owner ?? '');
  const repo = $derived(page.params.repo ?? '');
  let documents = $state<RepositoryDocument[]>(untrack(() => [...data.documents]));
  let activeDocument = $state<RepositoryDocument | null>(untrack(() => data.activeDocument));
  let documentHtml = $state(untrack(() => data.documentHtml));
  let documentCache = $state<Record<string, string>>(
    untrack(() => (data.activeDocument && data.documentHtml ? { [data.activeDocument.path]: data.documentHtml } : {}))
  );
  let loading = $state(false);
  let error = $state(false);
  let editorOpen = $state(false);
  let draftDocuments = $state<RepositoryDocument[]>([]);
  let saving = $state(false);
  let saveError = $state('');
  const remainingDocuments = $derived(
    data.availableDocuments.filter((candidate) => !draftDocuments.some((document) => document.path === candidate.path))
  );
  const canonicalOwner = $derived(data.repository.owner);
  const canonicalRepository = $derived(data.repository.name);
  const repositoryPath = $derived(`/${encodeURIComponent(canonicalOwner)}/${encodeURIComponent(canonicalRepository)}`);
  const repositoryUrl = $derived(`https://marl.sh${repositoryPath}`);
  const seoDescription = $derived(
    data.repository.description || `${canonicalOwner}/${canonicalRepository} is a public Git repository hosted on Marl.`
  );
  const repositoryUpdatedAt = $derived(isoTimestamp(data.repository.updatedAt));

  async function selectDocument(document: RepositoryDocument) {
    activeDocument = document;
    error = false;
    if (documentCache[document.path] !== undefined) {
      documentHtml = documentCache[document.path];
      return;
    }
    loading = true;
    try {
      const result = await api<{ html: string }>(repositoryDocumentPath(owner, repo, data.revision, document.path));
      documentCache = { ...documentCache, [document.path]: result.html };
      documentHtml = result.html;
    } catch {
      documentHtml = null;
      error = true;
    } finally {
      loading = false;
    }
  }

  function openEditor() {
    draftDocuments = [...documents];
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
      documents = result.documents;
      editorOpen = false;
      const next = documents.find((document) => document.path === activeDocument?.path) ?? documents[0] ?? null;
      if (next) await selectDocument(next);
      else {
        activeDocument = null;
        documentHtml = null;
      }
    } catch (cause) {
      saveError = cause instanceof MarlApiError ? cause.message : 'The overview could not be updated.';
    } finally {
      saving = false;
    }
  }
</script>

<Seo
  title={`${canonicalOwner}/${canonicalRepository} · Marl`}
  description={seoDescription}
  path={repositoryPath}
  robots={data.repository.visibility === 'public' ? 'index, follow' : 'noindex, nofollow'}
  jsonLd={{
    '@context': 'https://schema.org',
    '@type': 'SoftwareSourceCode',
    name: `${canonicalOwner}/${canonicalRepository}`,
    description: seoDescription,
    url: repositoryUrl,
    codeRepository: repositoryUrl,
    ...(repositoryUpdatedAt ? { dateModified: repositoryUpdatedAt } : {})
  }}
/>

<div class="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
  <article class="min-w-0">
    {#if documents.length || data.canManage}
      <nav aria-label="Repository documents" class="mb-5 flex flex-wrap items-center gap-1">
        {#each documents as document (document.path)}
          <button
            type="button"
            aria-pressed={activeDocument?.path === document.path}
            class={[
              'inline-flex h-8.5 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition-colors',
              activeDocument?.path === document.path
                ? 'bg-surface-muted text-ink-strong'
                : 'text-ink-muted hover:bg-surface-hover hover:text-ink-strong'
            ]}
            onclick={() => void selectDocument(document)}><FileText size={14} />{document.label}</button
          >
        {/each}
        {#if data.canManage}<Button
            icon
            size="small"
            variant="ghost"
            class="rounded-full"
            aria-label="Manage showcased files"
            title="Manage showcased files"
            onclick={openEditor}><Plus size={15} /></Button
          >{/if}
      </nav>
      {#if activeDocument}
        <div class={['transition-opacity', loading && 'opacity-50']} aria-busy={loading}>
          {#if error}<Notice>This document could not be loaded.</Notice>{:else if documentHtml}<MarkdownBody
              html={documentHtml}
              variant="document"
            />{:else if loading}<span class="flex items-center gap-2 text-sm text-ink-muted"
              ><Spinner />Loading document</span
            >{/if}
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
          {#if data.shellUser}<LinkButton size="small" href="/{owner}/{repo}/code">Browse the code</LinkButton>{/if}
        </EmptyState>
      </div>
    {/if}
  </article>

  <aside class="grid gap-4 text-sm lg:sticky lg:top-20">
    <h2 class="text-base font-semibold text-ink-strong">About</h2>
    <p class="leading-relaxed text-ink">{data.repository.description || 'No description provided.'}</p>
    <dl class="grid gap-2.5 text-ink-muted">
      <div class="flex items-center gap-2">
        <dt class="sr-only">Default branch</dt>
        <GitBranch size={15} />
        <dd class="font-mono text-xs text-ink">{data.revision}</dd>
      </div>
      <div class="flex items-center gap-2">
        <dt class="sr-only">Stars</dt>
        <Star size={15} />
        <dd><span class="font-semibold text-ink-strong tabular-nums">{data.repository.starCount ?? 0}</span> stars</dd>
      </div>
      <div class="flex items-center gap-2">
        <dt class="sr-only">Forks</dt>
        <GitFork size={15} />
        <dd><span class="font-semibold text-ink-strong tabular-nums">{data.repository.forkCount ?? 0}</span> forks</dd>
      </div>
      <div class="flex items-center gap-2">
        <dt class="sr-only">Updated</dt>
        <dd>Updated <Time value={data.repository.updatedAt} class="text-ink-muted" /></dd>
      </div>
    </dl>
  </aside>
</div>

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
