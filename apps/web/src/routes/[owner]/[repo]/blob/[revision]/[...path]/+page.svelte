<script lang="ts">
  import { page } from '$app/stores';
  import Copy from 'lucide-svelte/icons/copy';
  import Check from 'lucide-svelte/icons/check';
  import Download from 'lucide-svelte/icons/download';
  import FileCode2 from 'lucide-svelte/icons/file-code-2';
  import History from 'lucide-svelte/icons/history';
  import { apiText } from '$lib/api';
  import { encodeRepositoryPath, encodeRevision } from '$lib/repository-path';
  const filePath = $derived($page.params.path ?? 'README.md');
  const revision = $derived($page.params.revision ?? 'main');
  const revisionPath = $derived(encodeRevision(revision));
  let content = $state('');
  const lines = $derived(content.split('\n'));
  const base = $derived(`/${$page.params.owner}/${$page.params.repo}`);
  let loadError = $state(false);
  let copied = $state(false);
  let loadRequest = 0;
  async function copyFile() { await navigator.clipboard.writeText(content); copied = true; setTimeout(() => (copied = false), 1400); }
  function downloadFile() {
    const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = filePath.split('/').at(-1) ?? 'file'; anchor.click();
    URL.revokeObjectURL(url);
  }
  $effect(() => {
    const request = ++loadRequest;
    const owner = $page.params.owner;
    const repository = $page.params.repo;
    const selectedRevision = revisionPath;
    const selectedPath = filePath;
    content = '';
    loadError = false;
    void (async () => {
      try {
        const next = await apiText(`/repositories/${owner}/${repository}/blob/${selectedRevision}/${encodeRepositoryPath(selectedPath)}`);
        if (request === loadRequest) content = next;
      } catch {
        if (request === loadRequest) loadError = true;
      }
    })();
  });
</script>
<svelte:head><title>{filePath} · {$page.params.owner}/{$page.params.repo} · Sty</title></svelte:head>
<nav class="crumbs"><a href={base}>{$page.params.repo}</a><span>/</span>{#each filePath.split('/') as part, index}<a href="{base}/{index === filePath.split('/').length - 1 ? 'blob' : 'tree'}/{revisionPath}/{encodeRepositoryPath(filePath.split('/').slice(0,index+1).join('/'))}">{part}</a>{#if index < filePath.split('/').length - 1}<span>/</span>{/if}{/each}</nav>
<header class="file-head"><div><FileCode2 size={16} /><strong>{filePath.split('/').at(-1)}</strong><span>{lines.length} lines</span></div><div><a href="{base}/commits/{revisionPath}"><History size={14} />History</a><button aria-label="Copy file" onclick={copyFile}>{#if copied}<Check size={14} />{:else}<Copy size={14} />{/if}</button><button aria-label="Download file" onclick={downloadFile}><Download size={14} /></button></div></header>
<section class="code"><table><tbody>{#each lines as line, index}<tr><td><a href="#L{index + 1}" id="L{index + 1}">{index + 1}</a></td><td><pre>{line || ' '}</pre></td></tr>{/each}</tbody></table></section>
{#if loadError}<p class="error" role="status">This file could not be loaded from the repository service.</p>{/if}
<style>
  .crumbs { display: flex; align-items: center; gap: 6px; margin-bottom: 12px; color: var(--text-faint); font-size: 11px; } .crumbs a { color: var(--brand); font-weight: 570; text-decoration: none; } .file-head { display: flex; min-height: 46px; align-items: center; justify-content: space-between; padding: 0 10px 0 13px; border: 1px solid var(--border); border-radius: 8px 8px 0 0; background: var(--surface-muted); } .file-head > div { display: flex; align-items: center; gap: 7px; } .file-head strong { color: var(--text-strong); font-size: 11px; } .file-head span { color: var(--text-faint); font-size: 9px; } .file-head a, .file-head button { display: inline-flex; height: 29px; align-items: center; gap: 5px; padding: 0 8px; border: 1px solid var(--border); border-radius: 5px; background: var(--surface); color: var(--text-muted); font-size: 9px; text-decoration: none; cursor: pointer; } .file-head button { width: 29px; justify-content: center; padding: 0; }
  .code { overflow: auto; border: 1px solid var(--border); border-top: 0; border-radius: 0 0 8px 8px; background: var(--surface); } table { width: 100%; border-collapse: collapse; } td { padding: 0; vertical-align: top; } td:first-child { width: 1%; min-width: 48px; border-right: 1px solid var(--border-subtle); background: var(--surface-muted); text-align: right; user-select: none; } td:first-child a { display: block; padding: 0 10px; color: var(--text-faint); font-family: monospace; font-size: 10px; line-height: 20px; text-decoration: none; } td:first-child a:target { background: var(--brand-soft); color: var(--brand); } pre { min-height: 20px; margin: 0; padding: 0 13px; color: var(--text); font-family: "SFMono-Regular",Consolas,monospace; font-size: 10px; line-height: 20px; white-space: pre; }
  .error { margin: 10px 0 0; color: var(--danger); font-size: 10px; }
  @media(max-width:600px){.file-head a{display:none}.file-head span{display:none}}
</style>
