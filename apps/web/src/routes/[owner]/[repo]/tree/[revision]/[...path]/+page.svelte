<script lang="ts">
  import { page } from '$app/stores';
  import File from 'lucide-svelte/icons/file';
  import Folder from 'lucide-svelte/icons/folder';
  import Seo from '$lib/components/Seo.svelte';
  import Time from '$lib/components/Time.svelte';
  import { encodeRepositoryPath, encodeRevision } from '$lib/repository-path';
  import type { PageData } from './$types';

  type TreeEntry = PageData['entries'][number];

  let { data } = $props<{ data: PageData }>();
  const base = $derived(`/${$page.params.owner}/${$page.params.repo}`);
  const revision = $derived($page.params.revision ?? 'main');
  const current = $derived($page.params.path ?? '');
  const revisionPath = $derived(encodeRevision(revision));
  const parentPath = $derived(current.split('/').slice(0, -1).join('/'));
  const parentHref = $derived(`${base}/tree/${revisionPath}${parentPath ? `/${encodeRepositoryPath(parentPath)}` : ''}`);
  const entries = $derived(data.entries.map((entry: TreeEntry) => ({ name: entry.name, kind: entry.kind === 'tree' ? 'folder' as const : 'file' as const, message: entry.message ?? '', updatedAt: entry.updatedAt ?? '' })));
</script>
<Seo title={`${current || revision} · ${$page.params.owner}/${$page.params.repo} · Marl`} description={`Browse ${current || 'the repository root'} at ${revision} in ${$page.params.owner}/${$page.params.repo} on Marl.`} path={$page.url.pathname} robots={data.repository.visibility === 'public' ? 'index, follow' : 'noindex, nofollow'} />
<div class="tree-page">
  <nav class="crumbs"><a href="{base}/code">{$page.params.repo}</a><span>/</span>{#each current.split('/').filter(Boolean) as part, index (`${index}:${part}`)}<a href="{base}/tree/{revisionPath}/{encodeRepositoryPath(current.split('/').slice(0,index+1).join('/'))}">{part}</a><span>/</span>{/each}</nav>
  <section class="tree"><header><strong>{revision}</strong><span>{current || 'Repository root'}</span></header>{#if current}<a class="row parent" href={parentHref}><span><Folder size={15} />..</span><small>Parent directory</small></a>{/if}{#each entries as entry (entry.name)}<a class="row" href="{base}/{entry.kind === 'folder' ? 'tree' : 'blob'}/{revisionPath}/{encodeRepositoryPath(current ? `${current}/${entry.name}` : entry.name)}"><span>{#if entry.kind === 'folder'}<Folder size={15} fill="currentColor" />{:else}<File size={15} />{/if}<strong>{entry.name}</strong></span><span class="meta">{#if entry.message}<small>{entry.message}</small>{/if}{#if entry.updatedAt}<Time class="file-time" value={entry.updatedAt} />{/if}</span></a>{/each}</section>
</div>
<style>
  .tree-page{width:100%;margin:0}.crumbs { display:flex;flex-wrap:wrap;gap:6px;margin-bottom:18px;color:var(--text-faint);font-size:11px}.crumbs a{color:var(--brand);font-weight:570;text-decoration:none}.tree{overflow:hidden;border-radius:12px;background:var(--surface);box-shadow:var(--shadow-surface)}.tree>header{display:flex;align-items:center;gap:8px;min-height:44px;padding:0 12px;background:var(--surface-muted);font-size:11px}.tree>header strong{color:var(--text-strong)}.tree>header span{color:var(--text-faint)}.row{display:grid;grid-template-columns:minmax(160px,.7fr) minmax(0,1.3fr);min-height:44px;align-items:center;gap:12px;padding:0 16px;color:inherit;text-decoration:none}.row:hover{background:var(--surface-hover)}.row>span{display:flex;min-width:0;align-items:center;gap:8px;color:var(--brand)}.row strong{overflow:hidden;color:var(--text-strong);font-size:13px;text-overflow:ellipsis;white-space:nowrap}.row .meta{min-width:0;justify-content:flex-end;gap:18px}.row small{overflow:hidden;color:var(--text-muted);font-size:11px;text-overflow:ellipsis;white-space:nowrap}:global(.file-time){flex:none;color:var(--text-faint);font-size:11px;text-align:right}.parent>span{color:var(--text-muted)}
  @media(max-width:600px){.row{grid-template-columns:minmax(0,1fr) 80px}.row small{display:none}}
</style>
