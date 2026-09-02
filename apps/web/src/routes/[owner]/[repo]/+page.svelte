<script lang="ts">
  import { page } from '$app/stores';
  import { untrack } from 'svelte';
  import ArrowDown from 'lucide-svelte/icons/arrow-down';
  import ArrowUp from 'lucide-svelte/icons/arrow-up';
  import BookOpen from 'lucide-svelte/icons/book-open';
  import FileText from 'lucide-svelte/icons/file-text';
  import Plus from 'lucide-svelte/icons/plus';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import { api, apiText, MarlApiError } from '$lib/api';
  import Button from '$lib/components/Button.svelte';
  import MarkdownPreview from '$lib/components/MarkdownPreview.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import Seo from '$lib/components/Seo.svelte';
  import { encodeRepositoryPath } from '$lib/repository-path';
  import { isoTimestamp } from '$lib/time';
  import type { RepositoryDocument } from './+page';
  import type { PageData } from './$types';

  let { data } = $props<{ data: PageData }>();
  const owner = $derived($page.params.owner ?? '');
  const repo = $derived($page.params.repo ?? '');
  let documents = $state<RepositoryDocument[]>(untrack(() => [...data.documents]));
  let activeDocument = $state<RepositoryDocument | null>(untrack(() => data.activeDocument));
  let documentContent = $state(untrack(() => data.documentContent));
  let documentCache = $state<Record<string, string>>(untrack(() => data.activeDocument ? { [data.activeDocument.path]: data.documentContent } : {}));
  let loading = $state(false);
  let error = $state(false);
  let editorOpen = $state(false);
  let draftDocuments = $state<RepositoryDocument[]>([]);
  let saving = $state(false);
  let saveError = $state('');
  const remainingDocuments = $derived((data.availableDocuments as RepositoryDocument[]).filter((candidate) => !draftDocuments.some((document) => document.path === candidate.path)));
  const canonicalOwner = $derived(data.repository.owner);
  const canonicalRepository = $derived(data.repository.name);
  const repositoryPath = $derived(`/${encodeURIComponent(canonicalOwner)}/${encodeURIComponent(canonicalRepository)}`);
  const repositoryUrl = $derived(`https://marl.sh${repositoryPath}`);
  const seoDescription = $derived(data.repository.description || `${canonicalOwner}/${canonicalRepository} is a public Git repository hosted on Marl.`);
  const repositoryUpdatedAt = $derived(isoTimestamp(data.repository.updatedAt));

  async function selectDocument(document: RepositoryDocument) {
    activeDocument = document;
    error = false;
    if (documentCache[document.path] !== undefined) { documentContent = documentCache[document.path]; return; }
    loading = true;
    try {
      const content = await apiText(`/repositories/${owner}/${repo}/blob/${encodeURIComponent(data.revision)}/${encodeRepositoryPath(document.path)}`);
      documentCache = { ...documentCache, [document.path]: content };
      documentContent = content;
    } catch {
      documentContent = '';
      error = true;
    } finally { loading = false; }
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
    saving = true; saveError = '';
    try {
      const result = await api<{ documents: RepositoryDocument[] }>(`/repositories/${owner}/${repo}/overview`, { method: 'PUT', body: JSON.stringify({ documents: draftDocuments.map((document) => document.path) }) });
      documents = result.documents;
      editorOpen = false;
      const next = documents.find((document) => document.path === activeDocument?.path) ?? documents[0] ?? null;
      if (next) await selectDocument(next);
      else { activeDocument = null; documentContent = ''; }
    } catch (cause) {
      saveError = cause instanceof MarlApiError ? cause.message : 'The overview could not be updated.';
    } finally { saving = false; }
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

<article class="overview">
  {#if documents.length || data.canManage}
    <header>
      <nav aria-label="Repository documents">
        {#each documents as document (document.path)}
          <button class:active={activeDocument?.path === document.path} onclick={() => void selectDocument(document)}><FileText size={13} />{document.label}</button>
        {/each}
        {#if data.canManage}<button class="add" aria-label="Manage showcased files" title="Manage showcased files" onclick={openEditor}><Plus size={14} /></button>{/if}
      </nav>
    </header>
    {#if activeDocument}
      <div class:loading class="document">
        {#if error}<p class="empty">This document could not be loaded.</p>{:else if documentContent}<MarkdownPreview source={documentContent} context={{ owner, repository: repo, revision: data.revision, path: activeDocument.path }} />{/if}
      </div>
    {:else}<div class="empty compact"><BookOpen size={24} /><strong>No showcased files</strong><p>Choose a Markdown or text file from the default branch.</p></div>{/if}
  {:else}
    <div class="empty"><BookOpen size={24} /><strong>No project overview yet</strong><p>Add a README, license, contributing guide, security policy, or code of conduct to introduce this repository.</p>{#if data.shellUser}<a href="/{owner}/{repo}/code">Browse the code</a>{/if}</div>
  {/if}
</article>

<Modal open={editorOpen} title="Showcase files" description="Choose and arrange the documents shown on the repository overview." onClose={() => (editorOpen = false)}>
  {#snippet children()}
    <div class="showcase-editor">
      <div class="selected-files">
        {#each draftDocuments as document, index (document.path)}
          <div><FileText size={14} /><span><strong>{document.label}</strong><small>{document.path}</small></span><Button icon size="small" variant="ghost" disabled={index === 0} aria-label={`Move ${document.label} up`} onclick={() => moveDocument(index, -1)}><ArrowUp size={13} /></Button><Button icon size="small" variant="ghost" disabled={index === draftDocuments.length - 1} aria-label={`Move ${document.label} down`} onclick={() => moveDocument(index, 1)}><ArrowDown size={13} /></Button><Button icon size="small" variant="ghost" aria-label={`Remove ${document.label}`} onclick={() => (draftDocuments = draftDocuments.filter((candidate) => candidate.path !== document.path))}><Trash2 size={13} /></Button></div>
        {:else}<p>No files selected.</p>{/each}
      </div>
      {#if remainingDocuments.length}<div class="available-files"><strong>Add a file</strong>{#each remainingDocuments as document (document.path)}<button onclick={() => (draftDocuments = [...draftDocuments, document])}><Plus size={13} /><span>{document.label}<small>{document.path}</small></span></button>{/each}</div>{/if}
      {#if saveError}<p class="save-error" role="alert">{saveError}</p>{/if}
    </div>
  {/snippet}
  {#snippet actions()}<Button size="small" onclick={() => (editorOpen = false)}>Cancel</Button><Button size="small" variant="primary" loading={saving} onclick={saveDocuments}>Save overview</Button>{/snippet}
</Modal>

<style>
  .overview{width:min(920px,100%);margin:0 auto}.overview>header{display:flex;align-items:center;min-height:42px;margin-bottom:4px}nav{display:flex;flex-wrap:wrap;align-items:center;gap:7px}nav button{display:inline-flex;height:30px;align-items:center;gap:6px;padding:0 10px;border:1px solid var(--border);border-radius:999px;background:var(--surface);color:var(--text-muted);font-size:11px;font-weight:590;cursor:pointer}nav button:hover{border-color:var(--border-strong);background:var(--surface-muted);color:var(--text-strong)}nav button.active{border-color:color-mix(in srgb,var(--brand) 48%,var(--border));background:var(--brand-soft);color:var(--brand-strong)}nav button.add{width:30px;padding:0;justify-content:center;border-style:dashed}.document{min-height:240px;padding:25px 4px 50px;transition:opacity .15s}.document.loading{opacity:.55}.empty{display:grid;min-height:340px;place-content:center;justify-items:center;color:var(--text-faint);text-align:center}.empty.compact{min-height:250px}.empty strong{margin-top:13px;color:var(--text-strong);font-size:14px}.empty p{max-width:430px;margin:7px 0 15px;color:var(--text-muted);font-size:12px;line-height:1.55}.empty a{color:var(--brand);font-size:12px;font-weight:620;text-decoration:none}.showcase-editor{display:grid;gap:17px}.selected-files{display:grid;gap:5px}.selected-files>div{display:grid;grid-template-columns:20px minmax(0,1fr) repeat(3,30px);align-items:center;gap:3px;min-height:42px;padding:5px 4px 5px 8px;border-radius:6px;background:var(--surface)}.selected-files>div>:global(svg){color:var(--text-faint)}.selected-files span,.available-files span{min-width:0}.selected-files strong,.selected-files small,.available-files small{display:block}.selected-files strong{color:var(--text-strong);font-size:11px}.selected-files small,.available-files small{overflow:hidden;margin-top:2px;color:var(--text-faint);font-size:9px;text-overflow:ellipsis;white-space:nowrap}.selected-files>p{margin:0;padding:18px;color:var(--text-faint);text-align:center;font-size:10px}.available-files{display:grid;max-height:220px;overflow:auto;gap:3px}.available-files>strong{margin-bottom:3px;color:var(--text-muted);font-size:10px}.available-files button{display:flex;align-items:center;gap:8px;padding:7px 8px;border:0;border-radius:5px;background:transparent;color:var(--text);cursor:pointer;text-align:left}.available-files button:hover{background:var(--surface)}.available-files button>:global(svg){flex:0 0 auto;color:var(--brand)}.available-files button span{font-size:10px}.save-error{margin:0;color:var(--danger);font-size:10px}@media(max-width:680px){.document{padding-top:20px}}
</style>
