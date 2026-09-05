<script lang="ts">
  import { page } from '$app/stores';
  import { onDestroy } from 'svelte';
  import Copy from 'lucide-svelte/icons/copy';
  import Check from 'lucide-svelte/icons/check';
  import Download from 'lucide-svelte/icons/download';
  import FileCode2 from 'lucide-svelte/icons/file-code-2';
  import History from 'lucide-svelte/icons/history';
  import Button from '$lib/components/Button.svelte';
  import LinkButton from '$lib/components/LinkButton.svelte';
  import Seo from '$lib/components/Seo.svelte';
  import { encodeRepositoryPath, encodeRevision } from '$lib/repository-path';
  import type { PageData } from './$types';

  let { data } = $props<{ data: PageData }>();
  const filePath = $derived($page.params.path ?? 'README.md');
  const revision = $derived($page.params.revision ?? 'main');
  const revisionPath = $derived(encodeRevision(revision));
  const content = $derived(data.content);
  const lines = $derived(content.split('\n'));
  const base = $derived(`/${$page.params.owner}/${$page.params.repo}`);
  let copied = $state(false);
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;
  async function copyFile() { await navigator.clipboard.writeText(content); copied = true; clearTimeout(copiedTimer); copiedTimer = setTimeout(() => (copied = false), 1400); }
  function downloadFile() {
    const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = filePath.split('/').at(-1) ?? 'file'; anchor.click();
    URL.revokeObjectURL(url);
  }
  onDestroy(() => clearTimeout(copiedTimer));
</script>
<Seo title={`${filePath} · ${$page.params.owner}/${$page.params.repo} · Marl`} description={`View ${filePath} at ${revision} in ${$page.params.owner}/${$page.params.repo} on Marl.`} path={$page.url.pathname} robots={data.repository.visibility === 'public' ? 'index, follow' : 'noindex, nofollow'} />
<nav class="crumbs"><a href="{base}/code">{$page.params.repo}</a><span>/</span>{#each filePath.split('/') as part, index (`${index}:${part}`)}<a href="{base}/{index === filePath.split('/').length - 1 ? 'blob' : 'tree'}/{revisionPath}/{encodeRepositoryPath(filePath.split('/').slice(0,index+1).join('/'))}">{part}</a>{#if index < filePath.split('/').length - 1}<span>/</span>{/if}{/each}</nav>
<header class="file-head"><div><FileCode2 size={16} /><strong>{filePath.split('/').at(-1)}</strong><span>{lines.length} lines</span></div><div><LinkButton size="small" href="{base}/commits/{revisionPath}"><History size={14} />History</LinkButton><Button icon size="small" aria-label="Copy file" onclick={copyFile}>{#if copied}<Check size={14} />{:else}<Copy size={14} />{/if}</Button><Button icon size="small" aria-label="Download file" onclick={downloadFile}><Download size={14} /></Button></div></header>
<section class="code"><table><tbody>{#each lines as line, index (index)}<tr><td><a href="#L{index + 1}" id="L{index + 1}">{index + 1}</a></td><td><pre>{line || ' '}</pre></td></tr>{/each}</tbody></table></section>
<style>
  .crumbs { display: flex; align-items: center; gap: 6px; margin-bottom: 12px; color: var(--text-faint); font-size: 11px; } .crumbs a { color: var(--brand); font-weight: 570; text-decoration: none; } .file-head { display: flex; min-height: 46px; align-items: center; justify-content: space-between; padding: 0 10px 0 13px; border: 1px solid var(--border); border-radius: 8px 8px 0 0; background: var(--surface-muted); } .file-head > div { display: flex; align-items: center; gap: 7px; } .file-head strong { color: var(--text-strong); font-size: 11px; } .file-head span { color: var(--text-faint); font-size:11px; }
  .code { overflow: auto; border: 1px solid var(--border); border-top: 0; border-radius: 0 0 8px 8px; background: var(--surface); } table { width: 100%; border-collapse: collapse; } td { padding: 0; vertical-align: top; } td:first-child { width: 1%; min-width: 48px; border-right: 1px solid var(--border-subtle); background: var(--surface-muted); text-align: right; user-select: none; } td:first-child a { display: block; padding: 0 10px; color: var(--text-faint); font-family: monospace; font-size:11px; line-height: 20px; text-decoration: none; } td:first-child a:target { background: var(--brand-soft); color: var(--brand); } pre { min-height: 20px; margin: 0; padding: 0 13px; color: var(--text); font-family: "SFMono-Regular",Consolas,monospace; font-size:11px; line-height: 20px; white-space: pre; }
  @media(max-width:600px){.file-head :global(.link-button){display:none}.file-head span{display:none}}
</style>
