<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import File from 'lucide-svelte/icons/file';
  import Folder from 'lucide-svelte/icons/folder';
  import { api } from '$lib/api';
  import { encodeRepositoryPath, encodeRevision } from '$lib/repository-path';
  const base = $derived(`/${$page.params.owner}/${$page.params.repo}`);
  const revision = $derived($page.params.revision ?? 'main');
  const current = $derived($page.params.path ?? '');
  const revisionPath = $derived(encodeRevision(revision));
  let entries = $state<Array<{name:string;kind:'file'|'folder';message:string;updatedAt:string}>>([]);
  let loadError = $state(false);
  onMount(async () => {
    try {
      const query = new URLSearchParams({ revision, ...(current ? { path: current } : {}) });
      const result = await api<{ entries: Array<{ name: string; kind: 'blob' | 'tree' }> }>(`/repositories/${$page.params.owner}/${$page.params.repo}/tree?${query}`);
      entries = result.entries.map((entry) => ({ name: entry.name, kind: entry.kind === 'tree' ? 'folder' : 'file', message: 'Indexed from Git', updatedAt: 'Latest push' }));
    } catch { loadError = true; }
  });
</script>
<svelte:head><title>{current || revision} · {$page.params.owner}/{$page.params.repo} · Sty</title></svelte:head>
<nav class="crumbs"><a href={base}>{$page.params.repo}</a><span>/</span>{#each current.split('/').filter(Boolean) as part, index}<a href="{base}/tree/{revisionPath}/{encodeRepositoryPath(current.split('/').slice(0,index+1).join('/'))}">{part}</a><span>/</span>{/each}</nav>
<section class="tree"><header><strong>{revision}</strong><span>{current || 'Repository root'}</span></header>{#if current}<a class="row parent" href="{base}/tree/{revisionPath}"><span><Folder size={15} />..</span><small>Parent directory</small><time></time></a>{/if}{#each entries as entry}<a class="row" href="{base}/{entry.kind === 'folder' ? 'tree' : 'blob'}/{revisionPath}/{encodeRepositoryPath(current ? `${current}/${entry.name}` : entry.name)}"><span>{#if entry.kind === 'folder'}<Folder size={15} fill="currentColor" />{:else}<File size={15} />{/if}<strong>{entry.name}</strong></span><small>{entry.message}</small><time>{entry.updatedAt}</time></a>{/each}</section>
{#if loadError}<p class="error" role="alert">The repository tree could not be loaded. Refresh to try again.</p>{/if}
<style>
  .crumbs { display:flex;gap:6px;margin-bottom:12px;color:var(--text-faint);font-size:11px}.crumbs a{color:var(--brand);font-weight:570;text-decoration:none}.tree{overflow:hidden;border:1px solid var(--border);border-radius:8px;background:var(--surface)}.tree>header{display:flex;align-items:center;gap:8px;min-height:44px;padding:0 12px;border-bottom:1px solid var(--border);background:var(--surface-muted);font-size:11px}.tree>header strong{color:var(--text-strong)}.tree>header span{color:var(--text-faint)}.row{display:grid;grid-template-columns:minmax(160px,.7fr) minmax(180px,1fr) 100px;min-height:39px;align-items:center;gap:12px;padding:0 12px;border-top:1px solid var(--border-subtle);color:inherit;text-decoration:none}.row:first-of-type{border-top:0}.row:hover{background:var(--surface-hover)}.row>span{display:flex;align-items:center;gap:8px;color:var(--brand)}.row strong{color:var(--text-strong);font-size:11px}.row small{overflow:hidden;color:var(--text-muted);font-size:10px;text-overflow:ellipsis;white-space:nowrap}.row time{color:var(--text-faint);font-size:9px;text-align:right}.parent>span{color:var(--text-muted)}
  .error{color:var(--danger);font-size:10px}
  @media(max-width:600px){.row{grid-template-columns:minmax(0,1fr) 80px}.row small{display:none}}
</style>
