<script lang="ts">
  import { page } from '$app/stores';
  import File from 'lucide-svelte/icons/file';
  import Folder from 'lucide-svelte/icons/folder';
  import { api } from '$lib/api';
  import Time from '$lib/components/Time.svelte';
  import { encodeRepositoryPath, encodeRevision } from '$lib/repository-path';
  const base = $derived(`/${$page.params.owner}/${$page.params.repo}`);
  const revision = $derived($page.params.revision ?? 'main');
  const current = $derived($page.params.path ?? '');
  const revisionPath = $derived(encodeRevision(revision));
  const parentPath = $derived(current.split('/').slice(0, -1).join('/'));
  const parentHref = $derived(`${base}/tree/${revisionPath}${parentPath ? `/${encodeRepositoryPath(parentPath)}` : ''}`);
  let entries = $state<Array<{name:string;kind:'file'|'folder';message:string;updatedAt:string}>>([]);
  let loadError = $state(false);
  let loadRequest = 0;

  $effect(() => {
    const request = ++loadRequest;
    const owner = $page.params.owner;
    const repository = $page.params.repo;
    const selectedRevision = revision;
    const selectedPath = current;
    entries = [];
    loadError = false;
    void (async () => {
      try {
        const query = new URLSearchParams({ revision: selectedRevision, ...(selectedPath ? { path: selectedPath } : {}) });
        const result = await api<{ entries: Array<{ name: string; kind: 'blob' | 'tree'; message?: string; updatedAt?: string }> }>(`/repositories/${owner}/${repository}/tree?${query}`);
        if (request !== loadRequest) return;
        entries = result.entries.map((entry) => ({ name: entry.name, kind: entry.kind === 'tree' ? 'folder' : 'file', message: entry.message ?? '', updatedAt: entry.updatedAt ?? '' }));
      } catch {
        if (request === loadRequest) loadError = true;
      }
    })();
  });
</script>
<svelte:head><title>{current || revision} · {$page.params.owner}/{$page.params.repo} · Marl</title></svelte:head>
<div class="tree-page">
  <nav class="crumbs"><a href="{base}/code">{$page.params.repo}</a><span>/</span>{#each current.split('/').filter(Boolean) as part, index}<a href="{base}/tree/{revisionPath}/{encodeRepositoryPath(current.split('/').slice(0,index+1).join('/'))}">{part}</a><span>/</span>{/each}</nav>
  <section class="tree"><header><strong>{revision}</strong><span>{current || 'Repository root'}</span></header>{#if current}<a class="row parent" href={parentHref}><span><Folder size={15} />..</span><small>Parent directory</small></a>{/if}{#each entries as entry}<a class="row" href="{base}/{entry.kind === 'folder' ? 'tree' : 'blob'}/{revisionPath}/{encodeRepositoryPath(current ? `${current}/${entry.name}` : entry.name)}"><span>{#if entry.kind === 'folder'}<Folder size={15} fill="currentColor" />{:else}<File size={15} />{/if}<strong>{entry.name}</strong></span><span class="meta">{#if entry.message}<small>{entry.message}</small>{/if}{#if entry.updatedAt}<Time class="file-time" value={entry.updatedAt} />{/if}</span></a>{/each}</section>
  {#if loadError}<p class="error" role="alert">The repository tree could not be loaded. Refresh to try again.</p>{/if}
</div>
<style>
  .tree-page{width:min(1120px,100%);margin:0 auto}.crumbs { display:flex;gap:6px;margin-bottom:12px;color:var(--text-faint);font-size:11px}.crumbs a{color:var(--brand);font-weight:570;text-decoration:none}.tree{overflow:hidden;border:1px solid var(--border);border-radius:8px;background:var(--surface)}.tree>header{display:flex;align-items:center;gap:8px;min-height:44px;padding:0 12px;border-bottom:1px solid var(--border);background:var(--surface-muted);font-size:11px}.tree>header strong{color:var(--text-strong)}.tree>header span{color:var(--text-faint)}.row{display:grid;grid-template-columns:minmax(160px,.7fr) minmax(0,1.3fr);min-height:39px;align-items:center;gap:12px;padding:0 12px;border-top:1px solid var(--border-subtle);color:inherit;text-decoration:none}.row:first-of-type{border-top:0}.row:hover{background:var(--surface-hover)}.row>span{display:flex;align-items:center;gap:8px;color:var(--brand)}.row strong{color:var(--text-strong);font-size:11px}.row .meta{min-width:0;justify-content:flex-end;gap:18px}.row small{overflow:hidden;color:var(--text-muted);font-size:10px;text-overflow:ellipsis;white-space:nowrap}:global(.file-time){flex:none;color:var(--text-faint);font-size:9px;text-align:right}.parent>span{color:var(--text-muted)}
  .error{color:var(--danger);font-size:10px}
  @media(max-width:600px){.row{grid-template-columns:minmax(0,1fr) 80px}.row small{display:none}}
</style>
