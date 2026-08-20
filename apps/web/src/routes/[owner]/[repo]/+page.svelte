<script lang="ts">
  import { page } from '$app/stores';
  import { untrack } from 'svelte';
  import BookOpen from 'lucide-svelte/icons/book-open';
  import FileText from 'lucide-svelte/icons/file-text';
  import { apiText } from '$lib/api';
  import MarkdownPreview from '$lib/components/MarkdownPreview.svelte';
  import { encodeRepositoryPath, encodeRevision } from '$lib/repository-path';
  import type { RepositoryDocument } from './+page';
  import type { PageData } from './$types';

  let { data } = $props<{ data: PageData }>();
  const owner = $derived($page.params.owner ?? '');
  const repo = $derived($page.params.repo ?? '');
  const revisionPath = $derived(encodeRevision(data.revision));
  let activeDocument = $state<RepositoryDocument | null>(untrack(() => data.activeDocument));
  let documentContent = $state(untrack(() => data.documentContent));
  let documentCache = $state<Record<string, string>>(untrack(() => data.activeDocument ? { [data.activeDocument.path]: data.documentContent } : {}));
  let loading = $state(false);
  let error = $state(false);

  async function selectDocument(document: RepositoryDocument) {
    activeDocument = document;
    error = false;
    if (documentCache[document.path] !== undefined) {
      documentContent = documentCache[document.path];
      return;
    }
    loading = true;
    try {
      const content = await apiText(`/repositories/${owner}/${repo}/blob/${encodeURIComponent(data.revision)}/${encodeRepositoryPath(document.path)}`);
      documentCache = { ...documentCache, [document.path]: content };
      documentContent = content;
    } catch {
      documentContent = '';
      error = true;
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head><title>{owner}/{repo} · Marl</title></svelte:head>

<article class="overview">
  {#if data.documents.length}
    <header>
      <nav aria-label="Repository documents">
        {#each data.documents as document}
          <button class:active={activeDocument?.path === document.path} onclick={() => void selectDocument(document)}><BookOpen size={14} />{document.label}</button>
        {/each}
      </nav>
      {#if activeDocument}<a href="/{owner}/{repo}/blob/{revisionPath}/{encodeRepositoryPath(activeDocument.path)}"><FileText size={14} />View file</a>{/if}
    </header>
    <div class:loading class="document">
      {#if error}<p class="empty">This document could not be loaded.</p>{:else if documentContent}<MarkdownPreview source={documentContent} />{/if}
    </div>
  {:else}
    <div class="empty"><BookOpen size={24} /><strong>No project overview yet</strong><p>Add a README, license, contributing guide, security policy, or code of conduct to introduce this repository.</p><a href="/{owner}/{repo}/code">Browse the code</a></div>
  {/if}
</article>

<style>
  .overview{width:min(920px,100%);margin:0 auto}.overview>header{display:flex;min-height:44px;align-items:center;justify-content:space-between;gap:18px;border-bottom:1px solid var(--border)}nav{display:flex;align-self:stretch;gap:2px;overflow-x:auto}nav button{position:relative;display:inline-flex;flex:0 0 auto;align-items:center;gap:6px;padding:0 9px;border:0;background:transparent;color:var(--text-muted);font-size:11px;font-weight:580;cursor:pointer}nav button:hover,nav button.active{color:var(--text-strong)}nav button.active::after{position:absolute;inset:auto 8px -1px;height:2px;background:var(--brand);content:''}header>a{display:inline-flex;flex:0 0 auto;align-items:center;gap:5px;color:var(--text-muted);font-size:10px;text-decoration:none}header>a:hover{color:var(--brand)}.document{min-height:240px;padding:30px 4px 50px;transition:opacity .15s}.document.loading{opacity:.55}.empty{display:grid;min-height:340px;place-content:center;justify-items:center;color:var(--text-faint);text-align:center}.empty strong{margin-top:13px;color:var(--text-strong);font-size:14px}.empty p{max-width:430px;margin:7px 0 15px;color:var(--text-muted);font-size:12px;line-height:1.55}.empty a{color:var(--brand);font-size:12px;font-weight:620;text-decoration:none}@media(max-width:680px){.overview>header{align-items:flex-start;flex-direction:column;gap:0;padding-bottom:10px}.overview>header nav{width:100%;min-height:42px}.document{padding-top:24px}}
</style>
